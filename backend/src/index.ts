/**
 * Azhura CBT Backend - Server Entry Point
 *
 * Bootstraps a single Node.js HTTP server shared by the Elysia HTTP API and
 * the Socket.io realtime server. Requests to /ws (and its sub-paths) are
 * handled by Socket.io; all other requests are bridged to Elysia's fetch
 * handler so that CORS, auth middleware, and route groups work as normal.
 */

import http from "http";
import { createReadStream, existsSync, statSync } from "fs";
import { extname } from "path";
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
import { adminSupervisorRoutes } from "./routes/admin/supervisors";
import { adminSettingsRoutes } from "./routes/admin/settings";
import { adminLogsRoutes } from "./routes/admin/logs";
import { adminRecapRoutes } from "./routes/admin/recap";
import { adminSystemRoutes } from "./routes/admin/system";
import { adminDashboardRoutes } from "./routes/admin/dashboard";
import { adminExamSupervisorRoutes } from "./routes/admin/exam-supervisors";
import { adminMediaRoutes } from "./routes/admin/media";
import { supervisorQuestionRoutes } from "./routes/supervisor-questions";
import { supervisorMediaRoutes } from "./routes/supervisor-media";
import { infoRoutes } from "./routes/info";
import { setupRoutes } from "./routes/setup";
import { errorReportRoutes } from "./routes/error-reports";
import { initSocket } from "./socket";
import { getServerConfig, getAppVersion } from "./lib/env";
import { applyApiDocs } from "./lib/api-docs";
import { assertDbConnection } from "./db";
import { closeRedis } from "./lib/redis";
import { AppError } from "./lib/errors";
import { createLogger } from "./lib/logger";
import { writeAccessLog, logDirectory } from "./lib/log-files";
import { pruneOldLogs, LOG_RETENTION_DAYS } from "./lib/log-store";
import { ensureUploadDirs, MIME_MAP } from "./lib/upload";
import { parseByteRange } from "./lib/http-range";

const log = createLogger("Server");

/**
 * Streams a file from the `uploads/` directory to the response.
 * Runs before the Elysia bridge so large files are not buffered in-memory.
 * Rejects path traversal attempts with 403.
 *
 * Supports HTTP **Range** requests (`Accept-Ranges` + `206 Partial Content`),
 * which browsers require to play `<video>` and to seek within media — without
 * it Chrome refuses to start most MP4s (the cause of "video tidak bisa
 * diputar"; small audio files tolerate a plain `200`). See #164.
 */
async function serveUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const urlPath = (req.url ?? "").replace(/^\/uploads\//, "");
  if (urlPath.includes("..") || urlPath.includes("\0")) {
    res.writeHead(403);
    res.end();
    return;
  }
  const filePath = `./uploads/${urlPath}`;
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const contentType = MIME_MAP[extname(filePath).toLowerCase()] ?? "application/octet-stream";
  const { size } = statSync(filePath);
  const headers: Record<string, string | number> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  };

  // Honour a single byte-range request so browsers can play/seek <video>.
  const range = parseByteRange(req.headers.range, size);
  if (range === "unsatisfiable") {
    res.writeHead(416, { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" });
    res.end();
    return;
  }
  if (range) {
    res.writeHead(206, {
      ...headers,
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      "Content-Length": range.end - range.start + 1,
    });
    createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
    return;
  }

  res.writeHead(200, { ...headers, "Content-Length": size });
  createReadStream(filePath).pipe(res);
}

/** Per-request start time, keyed off Elysia's request-scoped store. */
interface AccessStore {
  requestStart: number;
}

const { port, corsOrigins, enableApiDocs } = getServerConfig();

// Fail fast if the database is unreachable.
await assertDbConnection();

// Ensure upload directories exist before serving any requests.
ensureUploadDirs();

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
      .use(adminSupervisorRoutes)
      .use(adminSettingsRoutes)
      .use(adminLogsRoutes)
      .use(adminRecapRoutes)
      .use(adminSystemRoutes)
      .use(adminDashboardRoutes)
      .use(adminExamSupervisorRoutes)
      .use(adminMediaRoutes)
      .use(supervisorQuestionRoutes)
      .use(supervisorMediaRoutes)
      .use(errorReportRoutes)
  );

// Interactive API docs (#177) — mounted only when ENABLE_API_DOCS is set, so
// production exposes no docs surface (route stays 404). No-op otherwise.
applyApiDocs(app, { enabled: enableApiDocs, version: getAppVersion() });

// Compile Elysia routes before using .handle() outside of .listen().
app.compile();

/**
 * Bridges a Node.js HTTP request to Elysia's Fetch API handler.
 * Converts IncomingMessage → Request, calls app.handle(), writes Response back.
 */
/**
 * Hard cap on a buffered request body. Guards every POST/PUT against unbounded
 * in-memory buffering before Elysia's per-field `t.Object` limits apply — an
 * authenticated client must not be able to exhaust memory with a giant body.
 * Set to 64 MiB: comfortably above the largest legitimate payload (a 50 MiB
 * video upload — see `lib/upload.ts` per-type caps — which this bridge buffers
 * whole before the per-type size check), while still bounding the worst case.
 * JSON endpoints stay far tighter via their own `t.Object` string limits.
 */
const MAX_BODY_BYTES = 64 * 1024 * 1024;

async function handleWithElysia(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Read body for non-GET/HEAD requests.
  let body: Buffer | undefined;
  const method = (req.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    try {
      body = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        let total = 0;
        req.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > MAX_BODY_BYTES) {
            reject(new Error("PAYLOAD_TOO_LARGE"));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks)));
        req.on("error", reject);
      });
    } catch (err) {
      if (err instanceof Error && err.message === "PAYLOAD_TOO_LARGE") {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Payload terlalu besar.", code: "PAYLOAD_TOO_LARGE" }));
        return;
      }
      throw err;
    }
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
  if ((req.url ?? "").startsWith("/uploads/")) {
    await serveUpload(req, res);
    return;
  }
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
