import Link from "next/link";
import type { TodaySummary } from "@/lib/today";

/** Yellow card: the top three topics waiting in the research inbox. */
export default function InboxCard({ inbox }: { inbox: TodaySummary["inbox"] }) {
  const first = inbox.top[0];
  return (
    <section className="sq-t-card sq-t-card-yellow" aria-labelledby="sq-t-inbox-h">
      <div className="sq-t-card-head">
        <h2 id="sq-t-inbox-h" className="t-eyebrow">
          Research inbox
        </h2>
        <Link href="/research" className="sq-t-badge" aria-label={`${inbox.count} topics in the research inbox`}>
          {inbox.count}
        </Link>
      </div>
      {inbox.top.length === 0 ? (
        <p className="sq-t-empty">Nothing waiting. Save a link or a half-thought in Research and it lands here.</p>
      ) : (
        <ul className="sq-t-inbox">
          {inbox.top.map((t) => (
            <li key={t.id}>
              <Link href={`/studio/${t.id}`} className="sq-t-inbox-row">
                <span className="t-body-strong">{t.title}</span>
                <span className="t-meta">
                  {t.pillarName.toUpperCase()} · {t.sourceCount} SOURCE{t.sourceCount === 1 ? "" : "S"}
                  {t.ready ? " · READY" : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="sq-t-actions">
        {first ? (
          <Link href={`/studio/${first.id}`} className="sq-btn sq-btn-dark">
            Turn one into posts
          </Link>
        ) : (
          <Link href="/research" className="sq-btn sq-btn-dark">
            Add a topic
          </Link>
        )}
      </div>
    </section>
  );
}
