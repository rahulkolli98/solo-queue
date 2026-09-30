import Link from "next/link";
import SlotRulesForm from "@/components/features/SlotRulesForm";

export default function SettingsPage() {
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

      <section className="sq-card" aria-label="Connections">
        <div className="sq-card-h">
          <h2 className="sq-card-title">Connections</h2>
          <span className="sq-tag" style={{ marginLeft: "auto" }}>
            Standard Access
          </span>
        </div>
        <p className="sq-muted" style={{ margin: 0 }}>
          Threads and Instagram tokens, health, and test actions live on the
          connections screen.
        </p>
        <div className="sq-row">
          <Link className="sq-btn" href="/settings/connections">
            Open connections
          </Link>
        </div>
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
