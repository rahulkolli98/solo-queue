import { Suspense } from "react";
import ConnectionsPanel from "@/components/features/ConnectionsPanel";
import { ERROR_COPY } from "@/lib/connectionErrors";
import { INSTAGRAM_SCOPES, THREADS_SCOPES } from "@/lib/oauth";

/**
 * Board 06 / 06g: the connection cards, the "How connecting works" note and a
 * placeholder for more platforms, plus the result of a Meta sign-in. The
 * scopes listed are the ones the sign-in actually asks Meta for.
 */
export default function ConnectionsSection({
  connected,
  error,
  detail,
}: {
  connected?: string;
  error?: string;
  detail?: string;
}) {
  const errCopy = error
    ? ERROR_COPY[error] ?? {
        title: "Something went wrong.",
        body: "Try connecting again.",
      }
    : null;

  return (
    <>
      {connected && (
        <div className="sq-banner sq-banner-good" role="status">
          {connected === "threads" ? "Threads" : "Instagram"} connected. The queue
          can now publish for you.
        </div>
      )}
      {errCopy && (
        <div className="sq-banner sq-banner-bad" role="alert">
          <strong>{errCopy.title}</strong> {errCopy.body}
          {detail && (
            <span className="sq-kv-mono st-banner-detail">
              Detail: {detail}
            </span>
          )}
        </div>
      )}
      <section className="st-stack" aria-label="Connections">
        <Suspense fallback={<p className="sq-muted">Loading connections…</p>}>
          <ConnectionsPanel />
        </Suspense>
      </section>
      <section className="sq-card" aria-label="How connecting works">
        <h3 className="st-eyebrow">How connecting works</h3>
        <p className="sq-muted">
          Solo Queue signs in through Meta&apos;s own login and only asks to read your profile and publish
          posts. You can revoke access anytime from your Meta account settings.
        </p>
        <p className="st-scopes">SCOPES · {[...THREADS_SCOPES, ...INSTAGRAM_SCOPES].join(" · ")}</p>
      </section>
      <button type="button" className="st-ghost" disabled>
        + X, YouTube or LinkedIn · coming later
      </button>
    </>
  );
}
