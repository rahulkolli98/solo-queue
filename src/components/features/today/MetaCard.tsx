import Link from "next/link";
import { PLATFORM_NAME } from "@/lib/queueBoard";
import { connectionNeedingYou, metaState, tokenLabel, type TodaySummary } from "@/lib/today";

const STATE_TAG = {
  healthy: { text: "● Healthy", cls: "" },
  needs: { text: "● Needs you", cls: " sq-t-tag-rust" },
  none: { text: "● Not connected", cls: " sq-t-tag-rust" },
} as const;

/** Blue card: token countdowns, posts in the last 24 hours against the Meta limits, and the $0 fee line. */
export default function MetaCard({ meta }: { meta: TodaySummary["meta"] }) {
  const state = metaState(meta.connections);
  const fix = connectionNeedingYou(meta.connections);
  return (
    <section className="sq-t-card sq-t-card-blue" aria-labelledby="sq-t-meta-h">
      <div className="sq-t-card-head">
        <h2 id="sq-t-meta-h" className="t-eyebrow">
          Meta connection
        </h2>
        <span className={`sq-t-tag${STATE_TAG[state].cls}`}>{STATE_TAG[state].text}</span>
      </div>
      <dl className="sq-t-kv">
        {meta.connections.map((c) => {
          const token = tokenLabel(c);
          return (
            <div key={c.platform} className="sq-t-kv-row">
              <dt>{PLATFORM_NAME[c.platform]} token</dt>
              <dd className={`t-mono${token.warn ? " sq-t-warn-ink" : ""}`}>{token.text}</dd>
            </div>
          );
        })}
        <div className="sq-t-kv-rule" role="presentation" />
        {meta.connections.map((c) => (
          <div key={`use-${c.platform}`} className="sq-t-kv-row">
            <dt>{PLATFORM_NAME[c.platform]} posts, 24 h</dt>
            <dd className="t-mono">{c.connected ? `${c.used24h} / ${c.limit}` : "—"}</dd>
          </div>
        ))}
        <div className="sq-t-kv-row">
          <dt>Per-post fees this month</dt>
          <dd className="sq-t-fee">$0</dd>
        </div>
      </dl>
      <div className="sq-t-actions">
        <Link href="/log" className="sq-btn">
          Publishing log
        </Link>
        <Link href="/settings/connections" className="sq-btn sq-btn-dark">
          {fix ? `Reconnect ${PLATFORM_NAME[fix]}` : state === "none" ? "Connect Threads" : "Manage connections"}
        </Link>
      </div>
    </section>
  );
}
