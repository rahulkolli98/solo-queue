"use client";

import Link from "next/link";
import { useState } from "react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import AddSourceForm from "@/components/features/studio/AddSourceForm";
import ClampedText from "@/components/ui/ClampedText";
import { ChevronDownIcon } from "@/components/features/studio/glyphs";

const TONES = ["yellow", "pink", "cream"] as const;
const MAX_NOTES = 4;

function sourceLabel(s: Doc<"sources">): string {
  return (s.label ?? (s.kind === "link" ? "Link" : s.kind === "quote" ? "Quote" : "Note")).toUpperCase();
}

function sourceBody(s: Doc<"sources">): string {
  return s.text ?? s.url ?? "";
}

/** Board 02: the blue topic collage (topic note, source notes, your note, + Add source, voice line). The story frames are chosen in the setup line above the columns. */
export default function TopicColumn({
  topic,
  sources,
  pillarName,
  voice,
}: {
  topic: Doc<"topics">;
  sources: Doc<"sources">[] | undefined;
  pillarName: string | undefined;
  voice: string | undefined;
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
            <ClampedText text={sourceBody(s)}>
              {(shown) => <span className="studio-note-text">{shown}</span>}
            </ClampedText>
          </div>
        ))}
        {more > 0 && (
          <Link href="/research" className="t-meta studio-more-link">
            +{more} MORE IN RESEARCH
          </Link>
        )}
        {topic.brief && (
          <div className="studio-note" data-tone="cream" data-i="8">
            <span className="t-meta">YOUR BRIEF · SENT TO THE MODEL WHEN YOU GENERATE</span>
            <ClampedText text={topic.brief}>
              {(shown) => <span className="studio-note-text">{shown}</span>}
            </ClampedText>
          </div>
        )}
        {topic.notes && (
          <div className="studio-note" data-tone="cream" data-i="9">
            <span className="t-meta">YOUR NOTE</span>
            <ClampedText text={topic.notes}>
              {(shown) => <span className="t-aside studio-note-aside">{shown}</span>}
            </ClampedText>
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
          <p className="studio-voice">
            <span className="t-meta">VOICE</span>
            <span className="studio-voice-text">{voice || "Not set yet."}</span>
            <Link href="/settings/voice" className="t-meta">
              EDIT IN SETTINGS
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
