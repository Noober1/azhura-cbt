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

  socket.on("alert-message", (data: { message: string }) => {
    useSocketStore.getState().setLastMessage(data.message);
    toast.info(`Pesan Pengawas: ${data.message}`, { duration: 8000 });
  });

  socket.on("force-submit", async (_data: { reason?: string }) => {
    toast.warning("Ujian dikumpulkan otomatis oleh pengawas!", { duration: 5000 });
    try {
      await useExamStore.getState().submitExam();
    } catch (error) {
      // submitExam is already defensive, but guard the handler so a failure
      // here cannot leave the socket callback in an unhandled-rejection state.
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
