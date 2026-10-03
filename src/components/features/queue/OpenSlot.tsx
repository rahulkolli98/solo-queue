import Link from "next/link";
import { PLATFORM_NAME, type Platform } from "@/lib/queueBoard";
import { studioFillHref } from "@/lib/studioHandoff";

/**
 * An unfilled slot as a dashed rust chip. It links to Studio, which says which
 * slot the founder came from and points at the inbox (the link only carries
 * the day, time and platform; queueing still takes the next free slot).
 */
export default function OpenSlot({
  platform,
  time,
  dayLabel,
  dayKey,
  variant = "card",
}: {
  platform: Platform;
  time: string;
  dayLabel: string;
  /** YYYY-MM-DD of the day; when given, Studio is told which slot is being filled. */
  dayKey?: string;
  variant?: "card" | "chip";
}) {
  return (
    <Link
      href={dayKey ? studioFillHref({ dayKey, time, platform }) : "/studio"}
      className={`sq-q-open sq-q-open-${variant}`}
      aria-label={`Open ${PLATFORM_NAME[platform]} slot, ${dayLabel} ${time}. Fill it from the research inbox.`}
    >
      <span className="t-meta">OPEN · {time}</span>
      {variant === "card" && <span className="sq-q-open-text">Fill from research inbox</span>}
    </Link>
  );
}

/** One dashed tile standing in for a whole day of unfilled Instagram slots (board 07h). */
export function OpenTile({ times, dayLabel, dayKey }: { times: string[]; dayLabel: string; dayKey?: string }) {
  return (
    <Link
      href={dayKey ? studioFillHref({ dayKey, time: times[0], platform: "instagram" }) : "/studio"}
      className="sq-q-open sq-q-open-tile"
      aria-label={`Open Instagram slots, ${dayLabel} ${times.join(" and ")}. Fill them from the research inbox.`}
    >
      <span className="sq-q-tile-format">OPEN</span>
      <span className="sq-q-open-text">Fill from research</span>
      <span className="t-meta">{times.join(" · ")}</span>
    </Link>
  );
}
