"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Error boundary for every route below the root layout. Diagnostic voice:
 * say what happened and what to do, never "Oops". (This Next version passes
 * `retry`, not `reset`.)
 */
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // No error service in v1: the console and Vercel logs are the record.
    console.error(error);
  }, [error]);

  return (
    <div className="sq-error-screen" role="alert">
      <span className="t-eyebrow">Display error</span>
      <h1>
        This page <em>stopped.</em>
      </h1>
      <p>
        Something failed while drawing this screen. Retry it, or go back to
        Today. This is a display error, so scheduled posts keep publishing on
        their own.
      </p>
      {error.digest && (
        <p className="t-mono">Reference: {error.digest}</p>
      )}
      <div className="sq-row">
        <button type="button" className="sq-btn sq-btn-primary" onClick={() => retry()}>
          Retry
        </button>
        <Link href="/" className="sq-btn">
          Back to Today
        </Link>
      </div>
    </div>
  );
}
