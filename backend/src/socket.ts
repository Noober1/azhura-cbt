/**
 * Azhura CBT Backend - Socket.io Realtime Server
 *
 * Attaches a Socket.io server to the shared Node.js HTTP server at path /ws,
 * authenticates each connection via a JWT in the handshake, and manages
 * per-user rooms. {@link supervisorActions} emits proctoring events to those rooms.
 */

import type { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";
import jwt from "jsonwebtoken";
import { getJwtSecret, getServerConfig } from "./lib/env";
import { createLogger } from "./lib/logger";
import { setLogBroadcaster } from "./lib/log-files";
import { setExamListBroadcaster } from "./lib/exam-events";
import { setRosterBroadcaster, notifyRosterPatch } from "./lib/roster-events";
import { buildRosterParticipant, hasActiveExam } from "./lib/roster";
import { sessionRegistry, CONNECTED_TTL } from "./lib/session-registry";
import { resolveBroadcast } from "./lib/broadcast";
import type { BroadcastTarget, SupervisorMessage, SupervisorMessageVariant } from "@azhura/shared";

const log = createLogger("Socket");

/**
 * How often (ms) a connected student's session TTL is refreshed. Must be safely
 * below {@link CONNECTED_TTL} so a live socket never lets its key expire.
 */
const HEARTBEAT_INTERVAL_MS = (CONNECTED_TTL / 3) * 1000;

/** The active Socket.io server; assigned by {@link initSocket}. */
export let io: SocketServer;

/** Shape of the JWT payload expected in the socket handshake. */
interface SocketJwt {
  userId: string;
  nis: string;
  role: string;
  /** The student's group; "" for supervisors/admins (no group). */
  groupId: string;
  /** Active-session id (jti) for single-session enforcement (#5); "" if unbound. */
  sessionId?: string;
}

/**
 * Attaches a Socket.io server to the provided HTTP server at path `/ws`,
 * wiring up JWT-based handshake authentication and room membership.
 *
 * @param httpServer - The shared Node.js HTTP server to attach to.
 * @returns The started {@link SocketServer} instance.
 */
export function initSocket(httpServer: HttpServer): SocketServer {
  const { corsOrigins, pingIntervalMs, pingTimeoutMs } = getServerConfig();
  const jwtSecret = getJwtSecret();

  io = new SocketServer(httpServer, {
    path: "/ws",
    cors: { origin: corsOrigins, methods: ["GET", "POST"] },
    // Engine.io ping/pong drives reliable liveness detection (#9): a missed pong
    // within the timeout fires `disconnect`, which flips roster status (#7) and
    // starts the session grace period (#5).
    pingInterval: pingIntervalMs,
    pingTimeout: pingTimeoutMs,
  });

  // Stream warn/error/access log entries live to the supervisor dashboard.
  setLogBroadcaster((entry) => {
    io.to("supervisors").emit("log-entry", entry);
  });

  // Wire the exam-list change seam (#3) to per-group room emits: when an admin
  // mutation changes the active-exam listing, the affected groups' students are
  // told to refetch. A minimal signal (no payload) avoids leaking data over WS.
  setExamListBroadcaster((affectedGroupIds) => {
    for (const groupId of affectedGroupIds) {
      io.to(`group:${groupId}`).emit("exam-list-updated");
    }
  });

  // Push live participant-roster changes (#7) to the supervisor dashboard. The
  // exam routes and the connect/disconnect handlers below call notifyRosterPatch;
  // this is the only place that touches Socket.io, mirroring the seams above.
  setRosterBroadcaster((patch) => {
    io.to("supervisors").emit("roster-update", patch);
  });

  // Handshake auth: verify the JWT before allowing the connection.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      log.warn("Socket rejected: missing token", { socketId: socket.id });
      return next(new Error("Token tidak ditemukan."));
    }

    try {
      const verified = jwt.verify(token, jwtSecret) as SocketJwt;
      socket.data.userId = verified.userId;
      socket.data.nis = verified.nis;
      socket.data.role = verified.role;
      socket.data.groupId = verified.groupId;
      socket.data.sessionId = verified.sessionId ?? "";
      next();
    } catch (error) {
      log.warn("Socket rejected: invalid token", {
        socketId: socket.id,
        reason: error instanceof Error ? error.message : String(error),
      });
      next(new Error("Token tidak valid."));
    }
  });

  io.on("connection", (socket) => {
    const { userId, nis, role } = socket.data;
    log.info("Socket connected", { nis, role, socketId: socket.id });

    socket.join(`user:${userId}`);
    if (role === "supervisor" || role === "admin") {
      socket.join("supervisors");
    }

    // Students join their group room so targeted exam-list updates (#3) reach
    // only the students eligible for the changed exam. `groupId` is "" for
    // non-students (no group), so they simply never join a group room.
    const groupId = socket.data.groupId as string | undefined;
    if (role === "student" && groupId) {
      socket.join(`group:${groupId}`);
    }

    // Single-session liveness (#5): bind this socket to the student's active
    // session and keep its Redis TTL refreshed while connected. The interval is
    // the *only* thing extending the key, so a dead socket/crashed server lets
    // the session expire — no account can deadlock.
    const sessionId = socket.data.sessionId as string | undefined;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    // Guards the race where a fast disconnect fires before the async
    // markConnected below resolves: without it the interval could be started
    // *after* disconnect and never cleared (leaking + defeating the grace TTL).
    let disconnected = false;

    if (role === "student" && sessionId) {
      void (async () => {
        const owns = await sessionRegistry.markConnected(userId, sessionId, socket.id);
        if (disconnected) return; // already gone — don't start a stray heartbeat
        if (!owns) {
          // The session was already replaced or expired — this device is stale.
          log.warn("Socket session no longer active; disconnecting", { nis, socketId: socket.id });
          socket.emit("kick", { reason: "Sesi Anda telah digantikan oleh perangkat lain." });
          socket.disconnect(true);
          return;
        }
        // Roster (#7): this student is now live — surface them to supervisors.
        // An upsert (not just a connection flag) makes them appear on the roster
        // even when idle on the dashboard, not only once they start an exam.
        void buildRosterParticipant(userId)
          .then((participant) => {
            if (participant && !disconnected) {
              notifyRosterPatch({ type: "upsert", participant });
            }
          })
          .catch((error) => {
            log.warn("Roster upsert on connect failed", {
              nis,
              reason: error instanceof Error ? error.message : String(error),
            });
          });
        heartbeat = setInterval(() => {
          void sessionRegistry.refresh(userId, sessionId).catch((error) => {
            log.warn("Session heartbeat refresh failed", {
              nis,
              reason: error instanceof Error ? error.message : String(error),
            });
          });
        }, HEARTBEAT_INTERVAL_MS);
      })();
    }

    socket.on("disconnect", (reason) => {
      log.info("Socket disconnected", { nis, socketId: socket.id, reason });
      disconnected = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      // Start the grace window: a reconnect with the same sessionId refreshes the
      // TTL back; otherwise the key expires and the account becomes free again.
      if (role === "student" && sessionId) {
        // Roster (#7): an exam-taker who drops stays visible as `disconnected`
        // (proctoring needs to see mid-exam drops); a dashboard student who
        // drops is simply removed from the list.
        void hasActiveExam(userId)
          .then((inExam) => {
            notifyRosterPatch(
              inExam
                ? { type: "connection", userId, connection: "disconnected", lastSeen: Date.now() }
                : { type: "remove", userId }
            );
          })
          .catch((error) => {
            log.warn("Roster patch on disconnect failed", {
              nis,
              reason: error instanceof Error ? error.message : String(error),
            });
          });
        void sessionRegistry.startGrace(userId, sessionId).catch((error) => {
          log.warn("Failed to start session grace period", {
            nis,
            reason: error instanceof Error ? error.message : String(error),
          });
        });
      }
    });
  });

  log.info("Socket.io attached at /ws");
  return io;
}

/**
 * Server-side helpers for pushing proctoring events to connected clients.
 * All target rooms established in {@link initSocket}.
 */
export const supervisorActions = {
  /**
   * Broadcasts a supervisor message (#13) to the target's rooms with the chosen
   * display variant. `all` reaches every non-supervisor client; `user`/`group`
   * reach their respective rooms (established in {@link initSocket}).
   */
  broadcastMessage: (
    target: BroadcastTarget,
    message: string,
    variant: SupervisorMessageVariant
  ) => {
    const { toAllStudents, rooms } = resolveBroadcast(target);
    const payload: SupervisorMessage = { message, variant };
    if (toAllStudents) {
      io.except("supervisors").emit("alert-message", payload);
      return;
    }
    for (const room of rooms) {
      io.to(room).emit("alert-message", payload);
    }
  },
  /** Forces a single user's client to submit their exam. */
  forceSubmitUser: (userId: string, reason?: string) => {
    io.to(`user:${userId}`).emit("force-submit", { reason });
  },
  /** Revokes a single user's access (client logs out). */
  kickUser: (userId: string, reason?: string) => {
    io.to(`user:${userId}`).emit("kick", { reason });
  },
};
