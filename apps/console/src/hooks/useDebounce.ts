/**
 * Azhura CBT Console — useDebounce.
 *
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * quiet. Used to throttle the exam-list search so each keystroke does not fire a
 * request.
 */

import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}
