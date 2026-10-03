"use client";

import { useSyncExternalStore } from "react";

function subscribe(): () => void {
  return () => {};
}

/** The browser's IANA time zone ("Asia/Kolkata"); "UTC" on the server and before hydration. */
export function useBrowserTz(): string {
  return useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    () => "UTC"
  );
}
