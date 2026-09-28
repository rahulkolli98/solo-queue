import { Suspense } from "react";
import ConnectionsInner from "./inner";
import { ERROR_COPY } from "@/lib/connectionErrors";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; detail?: string }>;
}) {
  const params = await searchParams;
  const errCopy = params.error
    ? ERROR_COPY[params.error] ?? {
        title: "Something went wrong.",
        body: "Try connecting again.",
      }
    : null;

  return (
    <>
      <span className="sq-tag">Standard Access</span>
      <h1 className="sq-headline">
        Two tokens, <em>zero fees.</em>
      </h1>

      {params.connected && (
        <div className="sq-banner sq-banner-good" role="status">
          {params.connected === "threads" ? "Threads" : "Instagram"}{" "}
          connected. The queue can now publish for you.
        </div>
      )}
      {errCopy && (
        <div className="sq-banner sq-banner-bad" role="alert">
          <strong>{errCopy.title}</strong> {errCopy.body}
          {params.detail && (
            <span className="sq-kv-mono" style={{ display: "block", marginTop: 8 }}>
              Detail: {params.detail}
            </span>
          )}
        </div>
      )}

      <Suspense fallback={<p className="sq-muted">Loading connections…</p>}>
        <ConnectionsInner />
      </Suspense>
    </>
  );
}
