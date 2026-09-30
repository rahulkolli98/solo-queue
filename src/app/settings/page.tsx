import { Suspense } from "react";
import CollapsibleSection from "@/components/features/CollapsibleSection";
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

      <CollapsibleSection
        title="Connections"
        tag="Standard Access"
        label="Connections"
        defaultOpen
      >
        <Suspense fallback={<p className="sq-muted">Loading connections…</p>}>
          <ConnectionsPanel />
        </Suspense>
      </CollapsibleSection>

      <CollapsibleSection title="Slot rules" label="Slot rules">
        <p className="sq-muted" style={{ margin: 0 }}>
          Default post times per platform. The composer pre-fills new slots
          with these; any slot can still be moved.
        </p>
        <SlotRulesForm />
      </CollapsibleSection>
    </>
  );
}
