"use client";

import { useSyncExternalStore } from "react";

function subscribe(): () => void {
  return () => {};
}

/**
 * False on the server and during hydration, true afterwards. Screens that
 * show a skeleton until their Convex data arrives use it so the first client
 * render matches the server HTML even when the data is already cached from
 * another component (the layout reads settings too).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}
