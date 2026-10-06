import { Suspense } from "react";
import ConnectionsPanel from "@/components/features/ConnectionsPanel";
import { ERROR_COPY } from "@/lib/connectionErrors";

/** Board 06 / 06g: the connection cards, plus the result of a Meta sign-in. */
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
            <span className="sq-kv-mono" style={{ display: "block", marginTop: 8 }}>
              Detail: {detail}
            </span>
          )}
        </div>
      )}
      <section className="sq-card" aria-label="Connections">
        <Suspense fallback={<p className="sq-muted">Loading connections…</p>}>
          <ConnectionsPanel />
        </Suspense>
      </section>
    </>
  );
}
