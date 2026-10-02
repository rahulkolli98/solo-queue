import { pillarInsight, queuedTotal, type TodaySummary } from "@/lib/today";

/** What is queued per pillar against the target share: two stacked bars, counts and one insight line. */
export default function PillarCard({ summary }: { summary: TodaySummary }) {
  const mix = summary.pillarMix;
  const total = queuedTotal(summary);
  const queuedLabel = mix.map((p) => `${p.name} ${p.count}`).join(", ");
  const targetLabel = mix.map((p) => `${p.name} ${p.target}%`).join(", ");
  return (
    <section className="sq-t-card sq-t-card-raised" aria-labelledby="sq-t-pillar-h">
      <div className="sq-t-card-head">
        <h2 id="sq-t-pillar-h" className="t-eyebrow">
          Pillar mix
        </h2>
        <span className="t-mono sq-t-muted">{total} QUEUED</span>
      </div>
      <div className="sq-t-bars">
        <span className="t-tag-sm sq-t-muted">QUEUED</span>
        <div className="sq-t-bar" role="img" aria-label={`Queued: ${queuedLabel}`}>
          {mix
            .filter((p) => p.count > 0)
            .map((p) => (
              <span key={p.key} style={{ flexGrow: p.count, background: `var(--color-${p.color})` }} />
            ))}
          {total === 0 && <span className="sq-t-bar-empty" />}
        </div>
        <span className="t-tag-sm sq-t-muted">TARGET</span>
        <div className="sq-t-bar sq-t-bar-target" role="img" aria-label={`Target: ${targetLabel}`}>
          {mix
            .filter((p) => p.target > 0)
            .map((p) => (
              <span key={p.key} style={{ flexGrow: p.target, background: `var(--color-${p.color})` }} />
            ))}
        </div>
      </div>
      <ul className="sq-t-legend">
        {mix.map((p) => (
          <li key={p.key}>
            <i style={{ background: `var(--color-${p.color})` }} aria-hidden="true" />
            <span className="sq-t-legend-name">{p.name}</span>
            <span className="t-mono">{p.count}</span>
            <span className="t-meta sq-t-muted sq-t-legend-pct">
              {p.actual}% / {p.target}%
            </span>
          </li>
        ))}
      </ul>
      <p className="sq-t-aside sq-t-aside-bottom">{pillarInsight(mix)}</p>
    </section>
  );
}
