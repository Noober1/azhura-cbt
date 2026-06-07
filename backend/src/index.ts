/**
 * Azhura CBT Backend - Server Entry Point
 *
 * Bootstraps a single Node.js HTTP server shared by the Elysia HTTP API and
 * the Socket.io realtime server. Requests to /ws (and its sub-paths) are
 * handled by Socket.io; all other requests are bridged to Elysia's fetch
 * handler so that CORS, auth middleware, and route groups work as normal.
 */

import http from "http";
import type { IncomingMessage, ServerResponse } from "http";
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { authRoutes } from "./routes/auth";
import { examRoutes } from "./routes/exam";
import { supervisorRoutes } from "./routes/supervisor";
import { adminExamRoutes } from "./routes/admin/exams";
import { adminQuestionRoutes } from "./routes/admin/questions";
import { adminGroupRoutes } from "./routes/admin/groups";
import { adminStudentRoutes } from "./routes/admin/students";
import { adminSettingsRoutes } from "./routes/admin/settings";
import { adminLogsRoutes } from "./routes/admin/logs";
import { adminRecapRoutes } from "./routes/admin/recap";
import { infoRoutes } from "./routes/info";
import { setupRoutes } from "./routes/setup";
import { initSocket } from "./socket";
import { getServerConfig } from "./lib/env";
import { assertDbConnection } from "./db";
import { closeRedis } from "./lib/redis";
import { AppError } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { writeAccessLog, logDirectory } from "./lib/log-files";
import { pruneOldLogs, LOG_RETENTION_DAYS } from "./lib/log-store";

const log = createLogger("Server");

/** Per-request start time, keyed off Elysia's request-scoped store. */
interface AccessStore {
  requestStart: number;
}

const { port, corsOrigins } = getServerConfig();

// Fail fast if the database is unreachable.
await assertDbConnection();

const app = new Elysia()
  .use(cors({ origin: corsOrigins, credentials: true }))
  .state("requestStart", 0)
  .onRequest(({ store }) => {
    (store as AccessStore).requestStart = Date.now();
  })
  .onAfterResponse(({ request, set, store }) => {
    const start = (store as AccessStore).requestStart;
    const { pathname } = new URL(request.url);
    writeAccessLog({
      method: request.method,
      path: pathname,
      status: typeof set.status === "number" ? set.status : 200,
      durationMs: start ? Date.now() - start : 0,
      ip: request.headers.get("x-forwarded-for") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });
  })
  .onError(({ code, error, set, request }) => {
    if (error instanceof AppError) {
      set.status = error.status;
      return { message: error.message, code: error.code };
    }
    if (code === "VALIDATION") {
      set.status = 400;
      return { message: "Permintaan tidak valid.", code: "VALIDATION" };
    }
    log.error("Unhandled server error", error, {
      code,
      method: request.method,
      url: request.url,
    });
    set.status = 500;
    return { message: "Terjadi kesalahan pada server.", code: "INTERNAL_ERROR" };
  })
  .get("/health", () => ({ status: "ok", time: new Date().toISOString() }))
  .group("/api", (app) =>
    app
      .use(infoRoutes)
      .use(setupRoutes)
      .use(authRoutes)
      .use(examRoutes)
      .use(supervisorRoutes)
      .use(adminExamRoutes)
      .use(adminQuestionRoutes)
      .use(adminGroupRoutes)
      .use(adminStudentRoutes)
      .use(adminSettingsRoutes)
      .use(adminLogsRoutes)
      .use(adminRecapRoutes)
  );

// Compile Elysia routes before using .handle() outside of .listen().
app.compile();

/**
 * Bridges a Node.js HTTP request to Elysia's Fetch API handler.
 * Converts IncomingMessage → Request, calls app.handle(), writes Response back.
 */
async function handleWithElysia(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Read body for non-GET/HEAD requests.
  let body: Buffer | undefined;
  const method = (req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    body = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  const headers = new Headers();
  for (const [key, val] of Object.entries(req.headers)) {
    if (!val) continue;
    if (Array.isArray(val)) val.forEach((v) => headers.append(key, v));
    else headers.set(key, val);
  }

  const fetchReq = new Request(
    `http://localhost:${port}${req.url ?? "/"}`,
    {
      method: req.method ?? "GET",
      headers,
      // Node's Buffer (`Buffer<ArrayBufferLike>`) isn't assignable to the Fetch
      // `BodyInit` type, which requires a plain `ArrayBuffer`-backed view. Copy
      // into a fresh Uint8Array (bodies are small) to get a `Uint8Array<ArrayBuffer>`.
      body: body && body.length > 0 ? new Uint8Array(body) : undefined,
    }
  );

  try {
    const response = await app.handle(fetchReq);

    const respHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      respHeaders[key] = value;
    });

    res.writeHead(response.status, respHeaders);
    res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
  } catch (error) {
    log.error("Bridge handler failed", error);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end(JSON.stringify({ message: "Terjadi kesalahan pada server.", code: "INTERNAL_ERROR" }));
    }
  }
}

// Create a single Node.js HTTP server shared by Elysia and Socket.io.
const httpServer = http.createServer();

// Attach Socket.io first so its "request" listener is registered for /ws.
initSocket(httpServer);

// Handle all other requests with Elysia. Socket.io's listener already
// claims /ws* requests; our early return prevents double-handling.
httpServer.on("request", async (req: IncomingMessage, res: ServerResponse) => {
  if ((req.url ?? "").startsWith("/ws")) return;
  await handleWithElysia(req, res);
});

httpServer.listen(port, () => {
  log.info(`Azhura CBT Backend running at http://localhost:${port}`);
  log.info(`Socket.io available at ws://localhost:${port}/ws`);
  log.info(`Access/warn/error logs writing to ${logDirectory}`);

  // Self-trim persisted logs on boot (#18) — drops entries older than the
  // retention window so an on-premise deployment never needs an external cron.
  void pruneOldLogs().then((deleted) => {
    if (deleted > 0) {
      log.info(`Pruned ${deleted} log entries older than ${LOG_RETENTION_DAYS} days`);
    }
  });
});

// Release the Redis connection on shutdown so the session registry doesn't leak
// a socket across hot-reloads / restarts.
let shuttingDown = false;
const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`Received ${signal}, shutting down…`);
  await closeRedis();
  httpServer.close(() => process.exit(0));
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

export type App = typeof app;
