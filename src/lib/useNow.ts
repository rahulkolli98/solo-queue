"use client";

import { useEffect, useState } from "react";

/**
 * The current time rounded down to the minute, refreshed every minute.
 * Convex queries must not read the clock, so screens pass this in as the
 * `now` argument; rounding keeps the query result cached within a minute.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 60000) * 60000);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 60000) * 60000), 60000);
    return () => clearInterval(id);
  }, []);
  return now;
}
