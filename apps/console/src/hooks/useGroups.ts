/**
 * Azhura CBT Console — useGroups.
 *
 * Loads all groups (up to 100) for pickers/filters. `enabled` lets callers tie
 * the fetch to a modal's open state so the list is refreshed each time the modal
 * opens (e.g. a group created elsewhere shows up without a manual refresh).
 */

import { useEffect, useState } from "react";
import { groupsApi } from "../lib/groups-api";
import { getErrorMessage } from "../lib/errors";
import type { GroupSummary } from "../types";

export function useGroups(enabled = true) {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    groupsApi
      .list({ limit: 100 })
      .then((res) => {
        if (active) {
          setGroups(res.data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err, "Gagal memuat group."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  return { groups, loading, error };
}
