"use client";

import Link from "next/link";
import { useState } from "react";
import {
  PLATFORM_NAME,
  dayState,
  weekdayName,
  type BoardCard,
  type BoardDay,
  type Platform,
  type PlatformFilter,
} from "@/lib/queueBoard";
import { studioFillHref } from "@/lib/studioHandoff";
import AtRiskMark from "./AtRiskMark";
import IgTile from "./IgTile";
import PlatformGlyph from "./PlatformGlyph";
import StatusChip, { statusLabel } from "./StatusChip";

type Entry =
  | { kind: "card"; time: string; card: BoardCard }
  | { kind: "open"; time: string; platform: Platform };

function entriesFor(day: BoardDay, platform: PlatformFilter): Entry[] {
  const list: Platform[] = platform === "both" ? ["threads", "instagram"] : [platform];
  const entries: Entry[] = [];
  for (const p of list) {
    for (const card of day[p]) entries.push({ kind: "card", time: card.time, card });
    for (const time of day.open[p]) entries.push({ kind: "open", time, platform: p });
  }
  return entries.sort((a, b) => a.time.localeCompare(b.time));
}

function MobileCard({ card, pillarName, onOpen }: { card: BoardCard; pillarName: string; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      className={`sq-q-mcard sq-q-st-${card.status}`}
      style={{ background: `var(--color-${card.pillarColor})` }}
      onClick={() => onOpen(card._id)}
      aria-label={`Threads post at ${card.time}, ${card.topicTitle}, ${statusLabel(card.status)}.${card.atRisk ? ` At risk: ${card.atRisk}` : ""} Open details.`}
    >
      <span className="sq-q-mcard-top">
        <PlatformGlyph platform="threads" size={20} />
        <span className="t-meta">THREADS · {pillarName.toUpperCase()}</span>
        <StatusChip status={card.status} />
      </span>
      <AtRiskMark reason={card.atRisk} />
      <span className="sq-q-mini-text">{card.snippet || card.topicTitle}</span>
    </button>
  );
}

/** Phones: seven day pills, then the chosen day as a time-ordered list (board MQueue). */
export default function Agenda({
  days,
  platform,
  pillarNames,
  empty,
  onOpen,
}: {
  days: BoardDay[];
  platform: PlatformFilter;
  /** pillar colour token -> display name */
  pillarNames: Record<string, string>;
  /** Nothing is queued at all: show the empty-queue panel above the open slots. */
  empty: boolean;
  onOpen: (id: string) => void;
}) {
  const [picked, setPicked] = useState(0);
  const day = days[Math.min(picked, days.length - 1)];
  const entries = entriesFor(day, platform);
  const posts = entries.filter((e) => e.kind === "card").length;
  return (
    <div className="sq-q-agenda">
      <div className="sq-q-daypills" role="group" aria-label="Pick a day">
        {days.map((d, i) => {
          const state = dayState(d, platform);
          const [dow, date] = d.label.split(" ");
          return (
            <button
              key={d.key}
              type="button"
              className="sq-q-daypill"
              aria-pressed={i === picked}
              aria-label={`${weekdayName(d.key)} ${date}${state === "gap" ? ", has open slots" : ""}`}
              onClick={() => setPicked(i)}
            >
              <span className="t-meta">{dow}</span>
              <span className="sq-q-daypill-num">{date}</span>
              <span className={`sq-q-daypill-dot sq-q-daypill-dot-${state}`} />
            </button>
          );
        })}
      </div>
      <div className="sq-q-agenda-head t-eyebrow">
        {weekdayName(day.key)} · {posts} post{posts === 1 ? "" : "s"} · {entries.length - posts} open
      </div>
      {empty && (
        <div className="sq-q-emptycard">
          <h2 className="t-title-lg sq-q-emptycard-title">
            Queue&apos;s <em>empty.</em>
          </h2>
          <p className="t-aside">Drop a topic and I&apos;ll draft both platforms.</p>
          <div className="sq-row">
            <Link href="/studio" className="sq-btn sq-btn-primary">
              Open Studio
            </Link>
            <Link href="/research" className="sq-btn">
              From research
            </Link>
          </div>
        </div>
      )}
      {entries.length === 0 && !empty && <p className="sq-muted">Nothing on this day. It is not a posting day.</p>}
      <ul className="sq-q-alist">
        {entries.map((e) => (
          <li key={e.kind === "card" ? e.card._id : `${e.platform}-${e.time}`} className="sq-q-arow">
            <span className={`t-mono sq-q-atime${e.kind === "open" ? " sq-q-atime-open" : ""}`}>{e.time}</span>
            {e.kind === "open" ? (
              <Link
                href={studioFillHref({ dayKey: day.key, time: e.time, platform: e.platform })}
                className={`sq-q-open sq-q-open-row${empty ? " sq-q-open-row-empty" : ""}`}
                aria-label={`Open ${PLATFORM_NAME[e.platform]} slot at ${e.time}. Fill it from the research inbox.`}
              >
                {empty ? `OPEN · ${PLATFORM_NAME[e.platform].toUpperCase()}` : "Open slot · fill from research inbox"}
              </Link>
            ) : e.card.platform === "threads" ? (
              <MobileCard card={e.card} pillarName={pillarNames[e.card.pillarColor] ?? ""} onOpen={onOpen} />
            ) : (
              <IgTile card={e.card} index={picked} onOpen={onOpen} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
