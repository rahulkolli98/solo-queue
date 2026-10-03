"use client";

import Link from "next/link";
import { useState } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import AddSourceForm from "@/components/features/studio/AddSourceForm";
import { ChevronDownIcon } from "@/components/features/studio/glyphs";
import FormField from "@/components/ui/FormField";

const TONES = ["yellow", "pink", "cream"] as const;
const MAX_NOTES = 4;

function sourceLabel(s: Doc<"sources">): string {
  return (s.label ?? (s.kind === "link" ? "Link" : s.kind === "quote" ? "Quote" : "Note")).toUpperCase();
}

function sourceBody(s: Doc<"sources">): string {
  return s.text ?? s.url ?? "";
}

/** Board 02: the blue topic collage (topic note, source notes, your note, + Add source, frame picker, voice line). */
export default function TopicColumn({
  topic,
  sources,
  pillarName,
  frames,
  frameValue,
  onFrame,
  beatLabels,
  voice,
  busy,
}: {
  topic: Doc<"topics">;
  sources: Doc<"sources">[] | undefined;
  pillarName: string | undefined;
  frames: Doc<"frames">[] | undefined;
  frameValue: string;
  onFrame: (key: string) => void;
  beatLabels: string[];
  voice: string | undefined;
  /** Generation is running: the frame cannot change under it. */
  busy: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(false);
  const shown = (sources ?? []).slice(0, MAX_NOTES);
  const more = (sources?.length ?? 0) - shown.length;

  return (
    <section className="studio-col studio-col-topic" data-open={open} aria-label="The topic">
      <div className="studio-topic-head">
        <h2 className="t-eyebrow">The topic</h2>
        <span className="t-meta">
          {sources === undefined ? "…" : `${sources.length} ${sources.length === 1 ? "SOURCE" : "SOURCES"}`}
        </span>
        <button
          type="button"
          className="studio-topic-toggle t-meta"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          EDIT
          <ChevronDownIcon />
        </button>
      </div>

      <div className="studio-note studio-note-title">
        <span className="sq-tape" aria-hidden="true" />
        <span className="t-title-lg">{topic.title}</span>
        {pillarName && <span className="t-meta studio-muted">PILLAR: {pillarName.toUpperCase()}</span>}
      </div>

      <div className="studio-topic-more">
        {shown.map((s, i) => (
          <div className="studio-note" data-tone={TONES[i % TONES.length]} data-i={i} key={s._id}>
            <span className="sq-tape" aria-hidden="true" />
            <span className="t-meta">SOURCE · {sourceLabel(s)}</span>
            <span className="studio-note-text">{sourceBody(s)}</span>
          </div>
        ))}
        {more > 0 && (
          <Link href="/research" className="t-meta studio-more-link">
            +{more} MORE IN RESEARCH
          </Link>
        )}
        {topic.notes && (
          <div className="studio-note" data-tone="cream" data-i="9">
            <span className="t-meta">YOUR NOTE</span>
            <span className="t-aside studio-note-aside">{topic.notes}</span>
          </div>
        )}

        <div className="studio-topic-tools">
          {adding ? (
            <AddSourceForm topicId={topic._id} onDone={() => setAdding(false)} />
          ) : (
            <button type="button" className="sq-btn studio-dashed" onClick={() => setAdding(true)}>
              + Add a source or link
            </button>
          )}
          <FormField label="Story frame" hint={beatLabels.length > 0 ? beatLabels.join(" · ") : undefined}>
            <select
              className="studio-select"
              value={frameValue}
              disabled={busy || !frames || frames.length === 0}
              onChange={(e) => onFrame(e.target.value)}
            >
              {(frames ?? []).map((f) => (
                <option key={f.key} value={f.key}>
                  {f.name}
                </option>
              ))}
              {frames && !frames.some((f) => f.key === frameValue) && (
                <option value={frameValue}>{frameValue}</option>
              )}
            </select>
          </FormField>
          <p className="studio-voice">
            <span className="t-meta">VOICE</span>
            <span className="studio-voice-text">{voice || "Not set yet."}</span>
            <Link href="/settings" className="t-meta">
              EDIT IN SETTINGS
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
