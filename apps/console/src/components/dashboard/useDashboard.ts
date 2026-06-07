import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "../../stores/auth";
import { connectConsoleSocket, disconnectConsoleSocket } from "../../lib/socket";
import { dashboardApi } from "../../lib/dashboard-api";
import { getErrorMessage } from "../../lib/errors";
import type { DashboardSnapshot } from "../../types";

export interface UseDashboardResult {
  snapshot: DashboardSnapshot | null;
  loading: boolean;
  error: string | null;
  wsConnected: boolean;
}

export function useDashboard(): UseDashboardResult {
  const token = useAuthStore((s) => s.token);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  const fetchSnapshot = useCallback(async () => {
    try {
      const data = await dashboardApi.get();
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memuat data dashboard."));
    }
  }, []);

  // HTTP snapshot on mount
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    void fetchSnapshot().finally(() => setLoading(false));
  }, [token, fetchSnapshot]);

  // Socket: receive broadcast updates + re-fetch on reconnect
  useEffect(() => {
    if (!token) return;
    const socket = connectConsoleSocket(token);

    // Preserve welcome.name from the initial HTTP load; broadcast payloads use a
    // generic placeholder since the backend can't know which admin is viewing.
    const onStats = (data: DashboardSnapshot) =>
      setSnapshot((prev) => ({ ...data, welcome: prev?.welcome ?? data.welcome }));
    const onConnect = () => {
      setWsConnected(true);
      // Re-sync on reconnect to catch any events missed while disconnected.
      void fetchSnapshot();
    };
    const onDisconnect = () => setWsConnected(false);

    socket.on("dashboard:stats", onStats);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    setWsConnected(socket.connected);

    return () => {
      socket.off("dashboard:stats", onStats);
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      disconnectConsoleSocket();
    };
  }, [token, fetchSnapshot]);

  return { snapshot, loading, error, wsConnected };
}
