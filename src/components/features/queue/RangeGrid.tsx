import Link from "next/link";
import { dayCards, PLATFORM_NAME, type BoardDay, type PlatformFilter } from "@/lib/queueBoard";
import { statusLabel } from "./StatusChip";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/**
 * The 3-week and month views: a calendar grid aligned to weekdays, one compact
 * chip per post (coloured by pillar) and a single dashed chip counting the
 * day's open slots. Same data as the week view, less detail per card.
 */
export default function RangeGrid({
  days,
  platform,
  onOpen,
}: {
  days: BoardDay[];
  platform: PlatformFilter;
  onOpen: (id: string) => void;
}) {
  const lead = days[0]?.weekday ?? 0;
  return (
    <div className="sq-q-range">
      {WEEKDAYS.map((w) => (
        <span key={w} className="sq-q-range-dow t-mono">
          {w}
        </span>
      ))}
      {Array.from({ length: lead }, (_, i) => (
        <span key={`pad-${i}`} className="sq-q-range-pad" aria-hidden="true" />
      ))}
      {days.map((day) => {
        const cards = dayCards(day, platform);
        const open =
          (platform === "instagram" ? 0 : day.open.threads.length) +
          (platform === "threads" ? 0 : day.open.instagram.length);
        return (
          <div key={day.key} className={`sq-q-range-day${day.isToday ? " sq-q-range-today" : ""}`}>
            <span className="sq-q-range-num">{day.label.split(" ")[1]}</span>
            {cards.map((c) => (
              <button
                key={c._id}
                type="button"
                className={`sq-q-compact sq-q-st-${c.status}`}
                style={{ background: `var(--color-${c.pillarColor})` }}
                onClick={() => onOpen(c._id)}
                aria-label={`${PLATFORM_NAME[c.platform]} ${c.time}, ${c.topicTitle}, ${statusLabel(c.status)}. Open details.`}
              >
                <span className="t-meta">{c.time}</span>
                <span className="sq-q-compact-title">{c.topicTitle}</span>
                <span className="t-tag-sm">{c.platform === "threads" ? "TH" : "IG"}</span>
              </button>
            ))}
            {open > 0 && (
              <Link href="/studio" className="sq-q-open sq-q-open-chip" aria-label={`${open} open slots on ${day.label}. Fill from research.`}>
                <span className="t-meta">{open} OPEN</span>
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
