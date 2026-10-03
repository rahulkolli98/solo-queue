"use client";

import FilterChip from "@/components/ui/FilterChip";
import { readinessLabel } from "../../../../convex/lib/research";
import { topicMetaLine } from "@/lib/researchBoard";
import { pillarOf, type BoardTopic, type Pillar } from "./types";

function TopicRow({
  topic,
  pillars,
  selected,
  now,
  onSelect,
}: {
  topic: BoardTopic;
  pillars: Pillar[];
  selected: boolean;
  now: number;
  onSelect: () => void;
}) {
  const pillar = pillarOf(pillars, topic.pillar);
  const label = readinessLabel({ ready: topic.ready, needsMore: topic.needsMore });
  return (
    <button type="button" className="rs-item" aria-pressed={selected} onClick={onSelect}>
      <span className="rs-item-top">
        <span
          className="rs-tag"
          style={pillar ? { background: `var(--color-${pillar.color})` } : undefined}
        >
          {pillar ? pillar.name : "No pillar yet"}
        </span>
        <span className={`rs-ready ${topic.ready ? "rs-ready-yes" : "rs-ready-no"}`}>
          {topic.ready ? "\u25CF " : ""}
          {label}
        </span>
      </span>
      <b className="rs-item-title">{topic.title}</b>
      <span className="rs-item-meta">{topicMetaLine(topic.sourceCount, topic.createdAt, now)}</span>
    </button>
  );
}

/**
 * The left column: pillar filter chips, the topic rows (READY first, then
 * what needs more) and the dashed box of topics already sent to Studio. It
 * renders into the screen's grid as two areas, "chips" and "list".
 */
export default function TopicRail({
  active,
  sent,
  activeTotal,
  pillars,
  pillarFilter,
  onFilter,
  selectedId,
  onSelect,
  onNew,
  now,
}: {
  active: BoardTopic[];
  sent: BoardTopic[];
  activeTotal: number;
  pillars: Pillar[];
  pillarFilter: string | null;
  onFilter: (key: string | null) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  now: number;
}) {
  const empty = activeTotal === 0 && sent.length === 0;
  return (
    <>
      <div className="rs-chips" role="group" aria-label="Filter by pillar">
        <FilterChip pressed={pillarFilter === null} onClick={() => onFilter(null)}>
          All · {activeTotal}
        </FilterChip>
        {pillars.map((p) => (
          <FilterChip
            key={p.key}
            pressed={pillarFilter === p.key}
            swatch={p.color}
            onClick={() => onFilter(pillarFilter === p.key ? null : p.key)}
          >
            {p.name}
          </FilterChip>
        ))}
      </div>
      <section className="rs-list" aria-label="Topics">
        {empty ? (
          <div className="rs-emptylist">
            <b>No topics yet</b>
            <span>
              Paste anything into the bar above. Each save becomes a topic here, sorted by what&apos;s
              ready to post.
            </span>
            <span className="t-meta rs-emptylist-hint">
              ↑ START WITH ONE LINK
            </span>
          </div>
        ) : (
          <>
            {active.map((t) => (
              <TopicRow
                key={t._id}
                topic={t}
                pillars={pillars}
                selected={t._id === selectedId}
                now={now}
                onSelect={() => onSelect(t._id)}
              />
            ))}
            {active.length === 0 && (
              <p className="rs-none">
                {activeTotal === 0
                  ? "Nothing waiting. Everything saved has gone to Studio."
                  : "No topics under this pillar yet."}
              </p>
            )}
            <button type="button" className="rs-newtopic" onClick={onNew}>
              + New topic
            </button>
            {sent.length > 0 && (
              <div className="rs-sent">
                <span className="t-meta rs-sent-label">
                  SENT TO STUDIO · {sent.length}
                </span>
                {sent.map((t) => (
                  <button
                    key={t._id}
                    type="button"
                    className="rs-sent-btn"
                    aria-pressed={t._id === selectedId}
                    onClick={() => onSelect(t._id)}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
