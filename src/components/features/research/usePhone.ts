"use client";

import { useSyncExternalStore } from "react";

const PHONE = "(max-width: 767px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True on phone-width screens (the CSS phone breakpoint). For copy that HTML
 * cannot switch by media query, such as an input's placeholder. The server and
 * the hydration pass answer false, so the first paint matches the server HTML.
 */
export function usePhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE).matches,
    () => false
  );
}
