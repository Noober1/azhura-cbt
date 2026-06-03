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

const log = createLogger("Socket");

/** The active Socket.io server; assigned by {@link initSocket}. */
export let io: SocketServer;

/** Shape of the JWT payload expected in the socket handshake. */
interface SocketJwt {
  userId: string;
  nis: string;
  role: string;
  /** The student's group; "" for supervisors/admins (no group). */
  groupId: string;
}

/**
 * Attaches a Socket.io server to the provided HTTP server at path `/ws`,
 * wiring up JWT-based handshake authentication and room membership.
 *
 * @param httpServer - The shared Node.js HTTP server to attach to.
 * @returns The started {@link SocketServer} instance.
 */
export function initSocket(httpServer: HttpServer): SocketServer {
  const { corsOrigins } = getServerConfig();
  const jwtSecret = getJwtSecret();

  io = new SocketServer(httpServer, {
    path: "/ws",
    cors: { origin: corsOrigins, methods: ["GET", "POST"] },
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

    socket.on("disconnect", (reason) => {
      log.info("Socket disconnected", { nis, socketId: socket.id, reason });
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
  /** Broadcasts an alert to every non-supervisor client. */
  alertAll: (message: string) => {
    io.except("supervisors").emit("alert-message", { message });
  },
  /** Sends an alert to a single user's room. */
  alertUser: (userId: string, message: string) => {
    io.to(`user:${userId}`).emit("alert-message", { message });
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
