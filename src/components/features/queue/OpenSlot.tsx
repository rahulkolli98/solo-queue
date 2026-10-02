import Link from "next/link";
import { PLATFORM_NAME, type Platform } from "@/lib/queueBoard";

/**
 * An unfilled slot as a dashed rust chip. It links to Studio, where a topic
 * from the research inbox becomes a draft for that slot.
 */
export default function OpenSlot({
  platform,
  time,
  dayLabel,
  variant = "card",
}: {
  platform: Platform;
  time: string;
  dayLabel: string;
  variant?: "card" | "chip";
}) {
  return (
    <Link
      href="/studio"
      className={`sq-q-open sq-q-open-${variant}`}
      aria-label={`Open ${PLATFORM_NAME[platform]} slot, ${dayLabel} ${time}. Fill it from the research inbox.`}
    >
      <span className="t-meta">OPEN · {time}</span>
      {variant === "card" && <span className="sq-q-open-text">Fill from research inbox</span>}
    </Link>
  );
}

/** One dashed tile standing in for a whole day of unfilled Instagram slots (board 07h). */
export function OpenTile({ times, dayLabel }: { times: string[]; dayLabel: string }) {
  return (
    <Link
      href="/studio"
      className="sq-q-open sq-q-open-tile"
      aria-label={`Open Instagram slots, ${dayLabel} ${times.join(" and ")}. Fill them from the research inbox.`}
    >
      <span className="sq-q-tile-format">OPEN</span>
      <span className="sq-q-open-text">Fill from research</span>
      <span className="t-meta">{times.join(" · ")}</span>
    </Link>
  );
}
