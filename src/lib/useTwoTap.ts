"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How long a destructive button stays armed before it relaxes (ms). */
export const ARM_MS = 4000;

/**
 * The two-tap pattern for destructive actions (design.md): the first tap arms
 * the button ("Tap again to delete"), the second runs the action. It relaxes
 * by itself after a few seconds.
 */
export function useTwoTap(): { armed: boolean; tap: (run: () => void) => void; reset: () => void } {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => clear, [clear]);

  const reset = useCallback(() => {
    clear();
    setArmed(false);
  }, [clear]);

  const tap = useCallback(
    (run: () => void) => {
      if (armed) {
        reset();
        run();
        return;
      }
      setArmed(true);
      clear();
      timer.current = setTimeout(() => setArmed(false), ARM_MS);
    },
    [armed, clear, reset]
  );

  return { armed, tap, reset };
}
