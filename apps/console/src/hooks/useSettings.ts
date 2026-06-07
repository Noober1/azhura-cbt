import { useEffect, useState } from "react";
import { settingsApi } from "../lib/settings-api";
import type { SystemSettings } from "../types";

export function useSettings(enabled = true) {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    settingsApi
      .get()
      .then((s) => {
        if (active) setSettings(s);
      })
      .catch(() => {
        /* non-critical — form falls back to 0 default */
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return { settings, loading };
}
