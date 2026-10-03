"use client";

import { useConvexAuth } from "convex/react";
import type { ReactNode } from "react";

/**
 * Shows the app only once Convex has accepted the operator token. Until then
 * (and whenever the session ends) the screens must not run: every Convex call
 * they make would be refused. A dropped login is fixed by a reload, which
 * brings the browser's Basic Auth prompt back.
 */
export default function SessionGate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  if (isLoading) {
    return (
      <div className="sq-gate" role="status" aria-live="polite">
        <span className="sq-gate-logo">
          solo queue<span className="sq-gate-dot" aria-hidden="true" />
        </span>
        <span className="sq-gate-note">Signing in…</span>
      </div>
    );
  }
  if (!isAuthenticated) return <SessionEnded />;
  return <>{children}</>;
}

export function SessionEnded() {
  return (
    <div className="sq-gate" role="alert">
      <span className="sq-gate-logo">
        solo queue<span className="sq-gate-dot" aria-hidden="true" />
      </span>
      <h1 className="sq-gate-title">Session ended.</h1>
      <p className="sq-gate-note">
        Solo Queue couldn&apos;t confirm it&apos;s you, so it stopped loading your data. Reload to sign in again.
      </p>
      <button type="button" className="sq-btn sq-btn-primary" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
