import Link from "next/link";
import { PLATFORM_NAME } from "@/lib/queueBoard";
import { charLimit, relativeIn, type TodaySummary } from "@/lib/today";
import PlatformGlyph from "../queue/PlatformGlyph";

/**
 * Coral card with the next scheduled post on a taped paper note. Edit opens
 * that post's drawer in the Queue (reschedule, replace media, cancel). There
 * is no "Post now": the publisher only runs at slot time.
 */
export default function UpNextCard({ upNext, now }: { upNext: TodaySummary["upNext"]; now: number }) {
  return (
    <section className="sq-t-card sq-t-card-coral" aria-labelledby="sq-t-next-h">
      <div className="sq-t-card-head">
        <h2 id="sq-t-next-h" className="t-eyebrow">
          Up next
        </h2>
        {upNext && <span className="t-mono">{relativeIn(upNext.scheduledAt - now)}</span>}
      </div>
      <div className="sq-paper sq-t-note">
        <span className="sq-t-tape" aria-hidden="true" />
        {upNext ? (
          <>
            <div className="sq-t-note-top">
              <PlatformGlyph platform={upNext.platform} size={22} />
              <span className="t-mono">
                {PLATFORM_NAME[upNext.platform].toUpperCase()} · {upNext.time}
              </span>
            </div>
            <p className="sq-t-note-body">{upNext.body}</p>
            <span className="t-meta sq-t-note-count">
              {upNext.body.length} / {charLimit(upNext.platform)}
            </span>
          </>
        ) : (
          <>
            <span className="t-mono">NOTHING SCHEDULED</span>
            <p className="sq-t-note-body">Nothing is waiting to post. Draft something in Studio and queue it.</p>
          </>
        )}
      </div>
      <div className="sq-t-actions">
        {upNext ? (
          <Link href={`/queue?slot=${upNext.slotId}`} className="sq-btn">
            Edit
          </Link>
        ) : (
          <Link href="/studio" className="sq-btn sq-btn-dark">
            Open Studio
          </Link>
        )}
      </div>
    </section>
  );
}
