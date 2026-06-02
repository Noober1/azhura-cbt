import { useEffect } from "react";
import { socket } from "../lib/socket";

/**
 * Custom React Hook to subscribe to a WebSocket event and clean up upon unmounting.
 * @param event Name of the socket event
 * @param callback Handler callback when the event is emitted
 */
export const useSocketEvent = (event: string, callback: (...args: any[]) => void) => {
  useEffect(() => {
    const activeSocket = socket;
    if (!activeSocket) return;

    activeSocket.on(event, callback);

    return () => {
      activeSocket.off(event, callback);
    };
  }, [event, callback]);
};
