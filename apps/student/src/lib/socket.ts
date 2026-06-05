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
import { useSocketStore } from "../stores/socket";
import { useExamStore } from "../stores/exam";
import { useAuthStore } from "../stores/auth";
import { toast } from "sonner";
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
};

/** Closes the realtime connection and releases the singleton. */
export const disconnectSocket = (): void => {
  if (!socket) return;
  socket.disconnect();
  socket = null;
};
