"use client";

import Link from "next/link";
import { beatsLine, tiltFor } from "@/lib/libraryBoard";
import type { Frame } from "./types";

/** One story frame in the rail: its colour, name, beat chain and use count. */
function RailFrame({ frame, index }: { frame: Frame; index: number }) {
  return (
    <Link
      href={`/library/frames?frame=${encodeURIComponent(frame.key)}`}
      className="lb-frame"
      style={{ background: `var(--color-${frame.color})`, transform: `rotate(${tiltFor(index)}deg)` }}
    >
      <span className="lb-frame-name">{frame.name}</span>
      <span className="t-meta">{beatsLine(frame.beats, frame.usedCount)}</span>
    </Link>
  );
}

export interface DraftSummary {
  fixing: number;
  saved: number;
  blog: number;
}

/**
 * The dark right rail on Published, Drafts and Media: drafts by status
 * (Drafts only), the story frames, the voice line and "New frame".
 */
export default function LibraryRail({
  frames,
  voice,
  learnedFrom,
  summary,
}: {
  frames: Frame[] | undefined;
  voice: string;
  learnedFrom: number;
  summary?: DraftSummary;
}) {
  return (
    <aside className="lb-rail" aria-label="Story frames and voice">
      {summary && (
        <div className="lb-rail-status">
          <h2 className="t-eyebrow">Drafts by status</h2>
          <div className="lb-rail-line">
            <span className="lb-pill lb-pill-bad">{summary.fixing}</span>Need fixing
            <span className="lb-pill lb-pill-ok">{summary.saved}</span>Saved
          </div>
          <div className="lb-rail-line">
            <span className="lb-pill lb-pill-mid">{summary.blog}</span>Blog drafts, never posted
          </div>
        </div>
      )}
      <div className="lb-rail-head">
        <h2 className="t-eyebrow">Story frames</h2>
        <span className="t-meta lb-rail-count">{frames?.length ?? ""}</span>
      </div>
      {(frames ?? []).map((f, i) => (
        <RailFrame key={f.key} frame={f} index={i} />
      ))}
      <div className="lb-voice">
        <span className="t-eyebrow lb-muted-chrome">Voice</span>
        <span className="lb-voice-text">{voice}</span>
        <span className="t-meta lb-muted-chrome">
          {learnedFrom > 0 ? `LEARNED FROM ${learnedFrom} OF YOUR POSTS` : "EDIT THE VOICE IN SETTINGS"}
        </span>
      </div>
      <Link href="/library/frames?frame=new" className="sq-btn sq-btn-light">
        New frame
      </Link>
    </aside>
  );
}

/** The phone version of the rail: a swipeable strip of frames above the postcards. */
export function FramesStrip({ frames }: { frames: Frame[] | undefined }) {
  if (!frames || frames.length === 0) return null;
  return (
    <div className="lb-strip">
      <div className="lb-strip-head">
        <span className="t-eyebrow">Story frames</span>
        <span className="t-meta">SWIPE →</span>
      </div>
      <div className="lb-strip-row">
        {frames.map((f, i) => (
          <RailFrame key={f.key} frame={f} index={i} />
        ))}
      </div>
    </div>
  );
}
