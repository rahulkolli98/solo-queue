import { Suspense } from "react";
import ConnectionsPanel from "@/components/features/ConnectionsPanel";
import SlotRulesForm from "@/components/features/SlotRulesForm";
import { ERROR_COPY } from "@/lib/connectionErrors";

export default async function SettingsPage({
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
      <span className="sq-tag">Settings</span>
      <h1 className="sq-headline">
        Dials, <em>not dashboards.</em>
      </h1>
      <p className="sq-sub">
        Connections and posting defaults. Everything here applies to your own
        accounts only.
      </p>

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

      <section className="sq-card" aria-label="Connections">
        <div className="sq-card-h">
          <h2 className="sq-card-title">Connections</h2>
          <span className="sq-tag" style={{ marginLeft: "auto" }}>
            Standard Access
          </span>
        </div>
        <Suspense fallback={<p className="sq-muted">Loading connections…</p>}>
          <ConnectionsPanel />
        </Suspense>
      </section>

      <section className="sq-card" aria-label="Slot rules">
        <div className="sq-card-h">
          <h2 className="sq-card-title">Slot rules</h2>
        </div>
        <p className="sq-muted" style={{ margin: 0 }}>
          Default post times per platform. The composer pre-fills new slots
          with these; any slot can still be moved.
        </p>
        <SlotRulesForm />
      </section>
    </>
  );
}
