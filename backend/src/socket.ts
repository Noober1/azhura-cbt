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
import { getJwtSecret, getServerConfig, getChatConfig } from "./lib/env";
import { createLogger } from "./lib/logger";
import { setLogBroadcaster } from "./lib/log-files";
import { setExamListBroadcaster } from "./lib/exam-events";
import { setRosterBroadcaster, notifyRosterPatch } from "./lib/roster-events";
import { buildRosterParticipant, hasActiveExam } from "./lib/roster";
import { sessionRegistry } from "./lib/session-registry";
import { createHeartbeatTracker } from "./lib/heartbeat";
import { resolveBroadcast } from "./lib/broadcast";
import { setChatBroadcaster, setChatConfigApplier, broadcastChatMessage } from "./lib/chat-events";
import { getRecentChat, saveChatMessage, getChatIdentity } from "./lib/chat-store";
import { createChatRateLimiter } from "./lib/chat-rate-limiter";
import { chatMuteRegistry } from "./lib/chat-mute";
import { sanitizeChatContent } from "./lib/chat-content";
import { readSettings } from "./lib/settings-service";
import { setDashboardBroadcaster, notifyDashboardStats, setOnlineStudentCountGetter } from "./routes/admin/dashboard";
import type {
  BroadcastTarget,
  ChatPresenceMember,
  SupervisorMessage,
  SupervisorMessageVariant,
} from "@azhura/shared";

const log = createLogger("Socket");

/** The active Socket.io server; assigned by {@link initSocket}. */
export let io: SocketServer;

/** Socket.io room that fans out public chat (#17) to its members. */
const CHAT_ROOM = "chat";

/** Public-chat tuning + the process-wide anti-spam limiter (#17). */
const chatConfig = getChatConfig();
const chatLimiter = createChatRateLimiter(chatConfig);

/**
 * Sentinel "lifts far in the future" used for an indefinite supervisor mute:
 * `ChatMutedEvent.mutedUntil` is a number, but the client keys off the `manual`
 * flag (not a countdown) for supervisor mutes, so the exact value is cosmetic.
 */
const INDEFINITE_MUTE_MS = 1000 * 60 * 60 * 24 * 365;

/**
 * Collects the distinct **students** currently in the chat room — the @mention
 * candidate list (#17). Supervisors/admins are in the room to observe/moderate
 * but are intentionally excluded so their identities aren't surfaced to students.
 */
async function computeChatPresence(): Promise<ChatPresenceMember[]> {
  const sockets = await io.in(CHAT_ROOM).fetchSockets();
  const byUser = new Map<string, ChatPresenceMember>();
  for (const s of sockets) {
    if (s.data.role !== "student") continue;
    const userId = s.data.userId as string;
    if (!userId || byUser.has(userId)) continue;
    byUser.set(userId, {
      userId,
      name: (s.data.name as string) ?? "",
      groupName: (s.data.groupName as string | null) ?? null,
    });
  }
  return [...byUser.values()];
}

/** Broadcasts the current chat presence to everyone in the room. */
async function emitChatPresence(): Promise<void> {
  const members = await computeChatPresence();
  io.to(CHAT_ROOM).emit("chat:presence", { members });
}

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
  const { corsOrigins, pingIntervalMs, pingTimeoutMs, heartbeatPingIntervalMs, heartbeatMaxMisses } =
    getServerConfig();
  const jwtSecret = getJwtSecret();

  io = new SocketServer(httpServer, {
    path: "/ws",
    cors: { origin: corsOrigins, methods: ["GET", "POST"] },
    // Transport-level liveness backstop: a missed engine pong within the timeout
    // fires `disconnect` for hard drops (network loss, killed process). The
    // app-level heartbeat below (#9) catches the subtler case the transport
    // can't — a client whose JS has frozen but whose socket still answers.
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

  // Public chat (#17): fan a saved message out to everyone in the chat room.
  setChatBroadcaster((message) => {
    io.to(CHAT_ROOM).emit("chat:message", message);
  });

  // Apply a global chat on/off toggle live (#17). On enable, pull eligible
  // sockets into the room and backfill history + presence; on disable, evict the
  // room. Either way, tell every client so the UI shows/hides the chat surface.
  setChatConfigApplier(async (enabled) => {
    if (enabled) {
      const sockets = await io.fetchSockets();
      for (const s of sockets) {
        const role = s.data.role as string;
        const userId = s.data.userId as string;
        if (role === "supervisor" || role === "admin") {
          s.join(CHAT_ROOM);
        } else if (role === "student" && !(await hasActiveExam(userId))) {
          s.join(CHAT_ROOM);
          // Re-lock the composer for a student who was muted while chat was off,
          // so it doesn't look usable until their first send is rejected.
          const muted = await chatMuteRegistry.isMuted(userId);
          if (muted) {
            io.to(`user:${userId}`).emit("chat:muted", {
              mutedUntil: muted.mutedUntil ?? Date.now() + INDEFINITE_MUTE_MS,
              reason: muted.reason || "Anda dibisukan oleh pengawas.",
              manual: true,
            });
          }
        }
      }
      const messages = await getRecentChat(chatConfig.historyLimit);
      io.to(CHAT_ROOM).emit("chat:history", { messages });
      await emitChatPresence();
    } else {
      const sockets = await io.in(CHAT_ROOM).fetchSockets();
      for (const s of sockets) s.leave(CHAT_ROOM);
    }
    io.emit("chat:config", { enabled });
  });

  // Push a fresh stats snapshot to all admins/supervisors on relevant mutations (#78).
  setDashboardBroadcaster((stats) => {
    io.to("supervisors").emit("dashboard:stats", stats);
  });

  // Count student sockets directly from Socket.io — no Redis grace-period lag.
  setOnlineStudentCountGetter(() => {
    let count = 0;
    for (const [, s] of io.sockets.sockets) {
      if ((s.data.role as string) === "student") count++;
    }
    return count;
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

    // Guards async work (chat setup below, single-session heartbeat further down)
    // that may resolve after a fast disconnect — set true in the disconnect handler.
    let disconnected = false;

    // Public chat (#17): tell the client whether chat is on, and — if it is —
    // pull this socket into the room with history + presence. Students join only
    // when NOT mid-exam, so the room is dashboard-only even though the same
    // socket also serves the exam (defense-in-depth, not just a UI gate).
    void (async () => {
      try {
        const { chatEnabled } = await readSettings();
        socket.emit("chat:config", { enabled: chatEnabled });
        if (!chatEnabled || disconnected) return;

        if (role === "student") {
          const identity = await getChatIdentity(userId);
          socket.data.name = identity?.name ?? nis;
          socket.data.groupName = identity?.groupName ?? null;
          if (await hasActiveExam(userId)) return; // dashboard-only
        }
        if (disconnected) return;
        socket.join(CHAT_ROOM);
        socket.emit("chat:history", { messages: await getRecentChat(chatConfig.historyLimit) });
        // Lock the composer up front if this student is already muted, so it
        // doesn't look usable until their first send round-trips a rejection.
        if (role === "student") {
          const muted = await chatMuteRegistry.isMuted(userId);
          if (muted) {
            socket.emit("chat:muted", {
              mutedUntil: muted.mutedUntil ?? Date.now() + INDEFINITE_MUTE_MS,
              reason: muted.reason || "Anda dibisukan oleh pengawas.",
              manual: true,
            });
          }
        }
        await emitChatPresence();
      } catch (error) {
        log.warn("Chat connect setup failed", {
          nis,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    // Inbound student message (#17). This is the only socket event the server
    // *receives* from clients besides heartbeat, so it is the trust boundary:
    // role, feature flag, mid-exam, sanitization, mute, and rate limit are all
    // enforced here before anything is persisted or broadcast.
    socket.on("chat:send", async (payload: { content?: unknown }) => {
      try {
        if (role !== "student") return;
        const { chatEnabled } = await readSettings();
        if (!chatEnabled) return;
        if (await hasActiveExam(userId)) return; // tamper guard: no chat mid-exam

        const result = sanitizeChatContent(payload?.content, chatConfig.maxLength);
        if (!result.ok) {
          socket.emit("chat:error", { reason: result.reason });
          return;
        }

        // A supervisor/admin manual mute takes precedence over anti-spam.
        const manual = await chatMuteRegistry.isMuted(userId);
        if (manual) {
          socket.emit("chat:muted", {
            mutedUntil: manual.mutedUntil ?? Date.now() + INDEFINITE_MUTE_MS,
            reason: manual.reason || "Anda dibisukan oleh pengawas.",
            manual: true,
          });
          return;
        }
        const rate = chatLimiter.check(userId, Date.now());
        if (!rate.allowed) {
          socket.emit("chat:muted", {
            // The limiter always sets a real deadline when rejecting; the
            // fallback keeps the client coherently muted if it ever doesn't.
            mutedUntil: rate.mutedUntil ?? Date.now() + chatConfig.muteMs,
            reason: "Terlalu banyak pesan. Mohon tunggu sebentar.",
            manual: false,
          });
          return;
        }

        const message = await saveChatMessage({
          kind: "user",
          userId,
          name: (socket.data.name as string) ?? nis,
          groupName: (socket.data.groupName as string | null) ?? null,
          content: result.content,
        });
        broadcastChatMessage(message);
      } catch (error) {
        log.warn("Chat send failed", {
          nis,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // Single-session liveness (#5): bind this socket to the student's active
    // session and keep its Redis TTL refreshed while connected. Only a genuine
    // `heartbeat:pong` (below) extends the key, so a dead socket/crashed server
    // — or a frozen client that can't answer — lets the session expire; no
    // account can deadlock.
    const sessionId = socket.data.sessionId as string | undefined;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    if (role === "student" && sessionId) {
      // App-level heartbeat (#9): a pong proves the client's JS is genuinely
      // alive (not just its transport). Each pong refreshes the session TTL and
      // `lastSeen`; a run of unanswered pings flatlines the connection. This
      // replaces the old blind interval refresh, which kept a frozen client's
      // session pinned for as long as its socket merely stayed open.
      const tracker = createHeartbeatTracker({ maxMisses: heartbeatMaxMisses });

      socket.on("heartbeat:pong", () => {
        tracker.recordPong();
        void sessionRegistry.refresh(userId, sessionId).catch((error) => {
          log.warn("Session heartbeat refresh failed", {
            nis,
            reason: error instanceof Error ? error.message : String(error),
          });
        });
      });

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
        // Dashboard (#78): online count changed — push updated stats.
        void notifyDashboardStats().catch(() => {});
        heartbeat = setInterval(() => {
          const flatlined = tracker.recordPing();
          if (flatlined) {
            // The client stopped answering. Force the disconnect so the handler
            // below becomes the single source of truth for "gone": it flips the
            // roster to `disconnected` (#7) and starts the session grace period
            // (#5). Clearing the interval first prevents any further ticks.
            log.warn("Heartbeat flatlined; disconnecting unresponsive socket", {
              nis,
              socketId: socket.id,
              misses: tracker.misses,
            });
            if (heartbeat) {
              clearInterval(heartbeat);
              heartbeat = null;
            }
            socket.disconnect(true);
            return;
          }
          socket.emit("heartbeat:ping");
        }, heartbeatPingIntervalMs);
      })();
    }

    socket.on("disconnect", (reason) => {
      log.info("Socket disconnected", { nis, socketId: socket.id, reason });
      disconnected = true;
      if (heartbeat) {
        clearInterval(heartbeat);
        heartbeat = null;
      }
      // Chat (#17): the socket has already left its rooms by now, so refresh the
      // remaining members' presence/mention list. No-op when the room is empty.
      void emitChatPresence().catch(() => {});
      // Dashboard (#78): online count changed — push updated stats.
      void notifyDashboardStats().catch(() => {});
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
  /**
   * Pushes a live time change (#8) to a single user's client: the new
   * authoritative `endTime` plus the server clock so the client can correct
   * clock skew before applying it to its countdown.
   */
  timeChangeUser: (userId: string, endTime: number) => {
    io.to(`user:${userId}`).emit("time-change", { endTime, serverTime: Date.now() });
  },
  /** Revokes a single user's access (client logs out). */
  kickUser: (userId: string, reason?: string) => {
    io.to(`user:${userId}`).emit("kick", { reason });
  },
  /**
   * Notifies a single user that a supervisor/admin muted them in chat (#17), so
   * their client locks the composer. `mutedUntil` null ⇒ indefinite (lifts only
   * on unmute); the client keys off `manual: true` rather than a countdown.
   */
  muteChatUser: (userId: string, mutedUntil: number | null, reason: string) => {
    io.to(`user:${userId}`).emit("chat:muted", {
      mutedUntil: mutedUntil ?? Date.now() + INDEFINITE_MUTE_MS,
      reason,
      manual: true,
    });
  },
  /** Notifies a single user that their chat mute was lifted (#17). */
  unmuteChatUser: (userId: string) => {
    io.to(`user:${userId}`).emit("chat:unmuted", { userId });
  },
  /**
   * Signals a single user's client that one of their sessions was reset (#58):
   * the client re-checks its active session and resumes into the exam. The
   * payload is intentionally empty — the client refetches over HTTP, mirroring
   * the `exam-list-updated` seam, so no session data crosses the socket.
   */
  resumeSessionUser: (userId: string) => {
    io.to(`user:${userId}`).emit("session-reset");
  },
};
