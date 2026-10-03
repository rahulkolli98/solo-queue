"use client";

import "./globals.css";

/**
 * Last resort: the root layout itself failed (for example, the Convex URL is
 * missing). Replaces the whole document, so it carries its own html/body.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="sq-error-screen" role="alert" style={{ padding: 40, color: "var(--color-on-chrome-strong)" }}>
          <span className="t-eyebrow">Solo Queue</span>
          <h1 style={{ color: "var(--color-on-chrome-strong)" }}>
            The app <em>failed to start.</em>
          </h1>
          <p style={{ color: "var(--color-muted-on-chrome)" }}>
            {error.message || "An unexpected error stopped the app."} Check the
            deployment settings, then retry.
          </p>
          <button type="button" className="sq-btn sq-btn-light" onClick={() => retry()}>
            Retry
          </button>
        </main>
      </body>
    </html>
  );
}
