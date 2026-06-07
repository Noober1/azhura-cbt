/**
 * Azhura CBT App - WebSocket (Socket.io) Client
 *
 * Manages the realtime connection to the supervisor/proctoring server. Beyond
 * connect/disconnect bookkeeping, it reacts to supervisor-pushed events:
 * - `alert-message` — shows a toast with the supervisor's message.
 * - `force-submit`  — submits the exam immediately and routes to the result page.
 * - `kick`          — revokes access, logs the student out, and returns to login.
 *
 * The active socket is a module-level singleton; use {@link connectSocket} /
 * {@link disconnectSocket} to manage its lifecycle.
 */

import { io, Socket } from "socket.io-client";
import type {
  ActiveSessionResponse,
  ChatConfigEvent,
  ChatErrorEvent,
  ChatHistoryEvent,
  ChatMessage,
  ChatMutedEvent,
  ChatPresenceEvent,
} from "@azhura/shared";
import { useSocketStore } from "../stores/socket";
import { useExamStore } from "../stores/exam";
import { useConnectivityStore } from "../stores/connectivity";
import { useAuthStore } from "../stores/auth";
import { useChatStore } from "../stores/chat";
import { toast } from "sonner";
import api from "./api";
import { createLogger } from "./logger";
import { toErrorContext } from "./errors";

const log = createLogger("Socket");

const SOCKET_URL = new URL(
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api"
).origin;

/** The active socket connection, or `null` when disconnected. */
export let socket: Socket | null = null;

/**
 * Opens the realtime connection (idempotent — a no-op if already connected)
 * and wires up supervisor event handlers.
 *
 * @param token JWT used to authenticate the socket handshake.
 */
export const connectSocket = (token: string): void => {
  if (socket) return;

  socket = io(SOCKET_URL, {
    auth: { token },
    autoConnect: true,
    path: "/ws",
  });

  socket.on("connect", () => {
    log.info("Connected to realtime server.");
    useSocketStore.getState().setConnected(true);
    // Socket (re)connect is the most reliable "back online" signal post-#9
    // heartbeat — flush any answers queued while disconnected (#10). This also
    // covers server-down-while-network-up, which `navigator.onLine` misses.
    void useConnectivityStore.getState().syncAnswers();
  });

  socket.on("disconnect", (reason) => {
    log.warn("Disconnected from realtime server.", { reason });
    useSocketStore.getState().setConnected(false);
  });

  // Surfacing handshake/transport errors makes proctoring issues traceable.
  socket.on("connect_error", (error) => {
    log.error("Realtime connection error", error, toErrorContext(error));
    useSocketStore.getState().setConnected(false);
  });

  // App-level heartbeat (#9): the server pings to confirm our JS is actually
  // responsive — not just that the transport is up. Answering keeps the session
  // alive and fresh on the supervisor roster; going silent for N pings flatlines
  // us server-side and starts the session grace period. This runs purely in the
  // socket layer (no store churn) so it keeps ticking even mid-render.
  socket.on("heartbeat:ping", () => {
    socket?.emit("heartbeat:pong");
  });

  socket.on("alert-message", (data: { message: string; variant?: "toast" | "modal" }) => {
    const store = useSocketStore.getState();
    store.setLastMessage(data.message);
    // A `modal` broadcast (#13) is shown as a blocking dialog the student must
    // acknowledge; everything else (and legacy payloads without a variant) is a
    // non-intrusive toast.
    if (data.variant === "modal") {
      store.setSupervisorModal(data.message);
    } else {
      toast.info(`Pesan Pengawas: ${data.message}`, { duration: 8000 });
    }
  });

  // The server (admin mutation) signalled that this student's exam list changed.
  // The payload is intentionally empty — the dashboard refetches `GET /exams`.
  socket.on("exam-list-updated", () => {
    log.info("Exam list updated by server — refreshing dashboard list.");
    useSocketStore.getState().bumpExamListVersion();
  });

  // A supervisor changed this student's remaining time (#8). Apply the new
  // authoritative endTime + server clock so the countdown updates live; the timer
  // hook re-derives remaining time from it on the next tick.
  socket.on("time-change", (data: { endTime: number; serverTime: number }) => {
    useExamStore.getState().applyTimeChange(data.endTime, data.serverTime);
    toast.info("Pengawas mengubah sisa waktu ujian Anda.", { duration: 6000 });
  });

  // A supervisor/admin reset one of this student's sessions (#58). Re-check the
  // active session over HTTP and resume into the exam immediately, so a student
  // sitting on the dashboard is moved without a manual refresh. No-op when there
  // is nothing to resume (e.g. the reset was undone or already consumed).
  socket.on("session-reset", async () => {
    try {
      const { data } = await api.get<ActiveSessionResponse>("/exams/sessions/active");
      if (data.status !== "resume") return;
      await useExamStore
        .getState()
        .setExamSession({ ...data.session, serverTime: data.serverTime });
      if (typeof window !== "undefined") window.location.hash = "/exam";
    } catch (error) {
      // Fail-soft: the dashboard resume-check on the next refresh/reconnect is
      // the backstop, so a transient failure here must not crash the handler.
      log.error("session-reset handler failed", error, toErrorContext(error));
    }
  });

  socket.on("force-submit", async (data: { reason?: string }) => {
    // Surface the supervisor's reason (#12); fall back to a polite default when
    // none was given.
    const reason = data.reason?.trim() || "Ujian Anda diselesaikan oleh pengawas.";
    toast.warning(reason, { duration: 6000 });
    try {
      // finalizeExam (#8) shows the Processing lock and retries until accepted,
      // so a force-finish never strands the student on a transient failure.
      await useExamStore.getState().finalizeExam();
    } catch (error) {
      // finalizeExam is defensive, but guard the handler so a failure here cannot
      // leave the socket callback in an unhandled-rejection state.
      log.error("Force-submit handler failed", error);
    }
    if (typeof window !== "undefined") window.location.hash = "/result";
  });

  socket.on("kick", async (data: { reason?: string }) => {
    toast.error(`Akses Anda dicabut: ${data.reason ?? "Dikeluarkan oleh pengawas"}`);
    disconnectSocket();
    try {
      await useAuthStore.getState().logout();
    } catch (error) {
      log.error("Logout during kick failed", error);
    }
    if (typeof window !== "undefined") window.location.hash = "/login";
  });

  // Admin reset the entire system (#79). Force-logout all connected clients so
  // they don't hold stale data or session state after the wipe.
  socket.on("system:reset", async () => {
    toast.info("Sistem direset oleh admin. Sesi Anda akan berakhir.", { duration: 5000 });
    disconnectSocket();
    try {
      await useAuthStore.getState().logout();
    } catch (error) {
      log.error("Logout during system:reset failed", error);
    }
    if (typeof window !== "undefined") window.location.hash = "/login";
  });

  // ── Public chat (#17) ──────────────────────────────────────────────────────
  // The server gates membership: these events only arrive on the dashboard
  // socket (never mid-exam), so the chat surface is inherently dashboard-only.

  socket.on("chat:config", (data: ChatConfigEvent) => {
    useChatStore.getState().setEnabled(data.enabled);
  });

  socket.on("chat:history", (data: ChatHistoryEvent) => {
    useChatStore.getState().setHistory(data.messages);
  });

  socket.on("chat:message", (message: ChatMessage) => {
    useChatStore.getState().pushMessage(message);
  });

  socket.on("chat:presence", (data: ChatPresenceEvent) => {
    useChatStore.getState().setPresence(data.members);
  });

  socket.on("chat:muted", (data: ChatMutedEvent) => {
    useChatStore.getState().setMuted(data.mutedUntil, data.reason, data.manual);
    toast.warning(
      data.manual ? `Anda dibisukan pengawas: ${data.reason}` : data.reason,
      { duration: 6000 }
    );
  });

  socket.on("chat:unmuted", () => {
    useChatStore.getState().clearMute();
    toast.info("Anda dapat mengirim pesan di chat kembali.");
  });

  socket.on("chat:error", (data: ChatErrorEvent) => {
    toast.error(data.reason);
  });
};

/**
 * Sends a chat message (#17). No-op when the socket is down — the composer is
 * disabled in that state, but this stays defensive.
 */
export const sendChat = (content: string): void => {
  socket?.emit("chat:send", { content });
};

/** Closes the realtime connection and releases the singleton. */
export const disconnectSocket = (): void => {
  if (!socket) return;
  socket.disconnect();
  socket = null;
};
