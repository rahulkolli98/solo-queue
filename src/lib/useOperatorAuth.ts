"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/** Where the browser gets its operator token (behind HTTP Basic Auth). */
export const TOKEN_PATH = "/api/convex-token";

/**
 * Fetch a fresh operator token, or null when there is none to give (the login
 * was dropped, the server key is missing, or the network is down).
 */
export async function fetchOperatorToken(): Promise<string | null> {
  try {
    const res = await fetch(TOKEN_PATH, { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return null;
    const body = (await res.json()) as { token?: unknown };
    return typeof body.token === "string" && body.token ? body.token : null;
  } catch {
    return null;
  }
}

/**
 * The `useAuth` hook `ConvexProviderWithAuth` wants. Convex calls
 * `fetchAccessToken` again shortly before each token expires, so the hourly
 * refresh needs no user action. If a refresh ever fails, Convex reports the
 * session as unauthenticated and the gate shows "Session ended".
 */
export function useOperatorAuth(fetchToken: () => Promise<string | null> = fetchOperatorToken) {
  const [state, setState] = useState<{ isLoading: boolean; ok: boolean }>({ isLoading: true, ok: false });

  useEffect(() => {
    let alive = true;
    void fetchToken().then((token) => {
      if (alive) setState({ isLoading: false, ok: token !== null });
    });
    return () => {
      alive = false;
    };
  }, [fetchToken]);

  const fetchAccessToken = useCallback(
    async (_args: { forceRefreshToken: boolean }) => fetchToken(),
    [fetchToken]
  );

  return useMemo(
    () => ({ isLoading: state.isLoading, isAuthenticated: state.ok, fetchAccessToken }),
    [state, fetchAccessToken]
  );
}
