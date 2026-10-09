"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  duplicateFrame,
  emptyFrame,
  fitsLine,
  matchesSearch,
  tiltFor,
  type FrameDraft,
} from "@/lib/libraryBoard";
import { defaultChipLabel, effectiveDefaultKinds } from "@/lib/frameDefaults";
import FrameProposer from "../frames/FrameProposer";
import FrameEditor from "./FrameEditor";
import { PostcardSkeletons } from "./PublishedTab";
import type { Frame, LibraryFilters, Pillar, Voice } from "./types";

function toDraft(frame: Frame): FrameDraft {
  return {
    key: frame.key,
    name: frame.name,
    beats: frame.beats.map((b) => ({ ...b })),
    fits: [...frame.fits],
    color: frame.color,
    style: frame.style ?? "",
  };
}

function FrameCard({
  frame,
  index,
  selected,
  defaultFor,
  onSelect,
}: {
  frame: Frame;
  index: number;
  selected: boolean;
  /** The formats this frame is the effective default for (one chip each). */
  defaultFor: ReturnType<typeof effectiveDefaultKinds>;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className="lb-fc"
      aria-pressed={selected}
      style={{ background: `var(--color-${frame.color})`, transform: `rotate(${tiltFor(index) * 0.9}deg)` }}
      onClick={onSelect}
    >
      <span className="lb-fc-top">
        <span className="t-mono">USED {frame.usedCount}×</span>
        {selected && <span className="lb-pill lb-pill-ink">EDITING</span>}
      </span>
      <span className="lb-fc-name">{frame.name}</span>
      <span className="t-mono lb-fc-chain">{frame.beats.map((b) => b.label.toUpperCase()).join(" → ")}</span>
      <span className="lb-beats">
        {frame.beats.map((b, i) => (
          <span key={i} className="lb-beat">
            <i>{i + 1}</i>
            <span>
              <b className="lb-beat-label">{b.label}</b>
              <span className="lb-beat-hint"> {b.hint}</span>
            </span>
          </span>
        ))}
      </span>
      {defaultFor.length > 0 && (
        <span className="lb-fc-defaults">
          {defaultFor.map((kind) => (
            <span key={kind} className="lb-pill lb-pill-ink">
              {defaultChipLabel(kind)}
            </span>
          ))}
        </span>
      )}
      <span className="t-tag-sm lb-fc-fits">{fitsLine(frame.fits)}</span>
    </button>
  );
}

/**
 * Library › Story frames: the frame cards beside the editor rail. The frame
 * being edited lives in the URL (?frame=<key>, or ?frame=new).
 */
export default function FramesTab({
  filters,
  pillars,
  frames,
  voice,
}: {
  filters: LibraryFilters;
  pillars: Pillar[];
  frames: Frame[] | undefined;
  /** The saved voice settings: the per-format default frames live here. */
  voice?: Voice;
}) {
  const searchParams = useSearchParams();
  const param = searchParams.get("frame");
  // A duplicate is an unsaved copy held here until it is saved or dropped.
  const [seed, setSeed] = useState<{ id: number; draft: FrameDraft } | null>(null);
  // "Learn from a post" opens a panel above the cards; nothing is saved until the founder says so.
  const [learnOpen, setLearnOpen] = useState(false);
  const learnRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (learnOpen) learnRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [learnOpen]);

  function select(frame: string) {
    setSeed(null);
    window.history.replaceState(null, "", `?frame=${encodeURIComponent(frame)}`);
    if (window.matchMedia("(max-width: 767px)").matches) {
      document.getElementById("lb-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const colors = Array.from(new Set(pillars.map((p) => p.color)));
  const visible = (frames ?? []).filter((f) =>
    matchesSearch([f.name, ...f.beats.map((b) => b.label)], filters.search)
  );

  let editor: { id: string; draft: FrameDraft; usedCount: number } | null = null;
  if (frames && frames.length > 0) {
    if (seed) {
      editor = { id: `seed-${seed.id}`, draft: seed.draft, usedCount: 0 };
    } else if (param === "new") {
      editor = { id: "new", draft: emptyFrame(colors[0] ?? "pillar-build"), usedCount: 0 };
    } else {
      const frame = frames.find((f) => f.key === param) ?? frames[0];
      editor = { id: frame.key, draft: toDraft(frame), usedCount: frame.usedCount };
    }
  }
  const editingKey = editor && !seed && param !== "new" ? editor.id : null;

  return (
    <div className="lb-grid">
      <div className="lb-main">
        {learnOpen && frames !== undefined && (
          <div className="lb-learn" id="lb-learn-panel" ref={learnRef}>
            <div className="lb-learn-head">
              <h2 className="t-eyebrow">Learn from a post</h2>
              <button type="button" className="sq-btn lb-learn-close" onClick={() => setLearnOpen(false)}>
                Close
              </button>
            </div>
            <FrameProposer sources={["post"]} frames={frames} onDone={() => setLearnOpen(false)} />
          </div>
        )}
        <div className="lb-cards lb-cards-frames">
          {frames === undefined ? (
            <PostcardSkeletons />
          ) : frames.length === 0 ? (
            <p className="lb-note" role="status">
              Setting up your starter frames…
            </p>
          ) : (
            <>
              {visible.map((f, i) => (
                <FrameCard
                  key={f.key}
                  frame={f}
                  index={i}
                  selected={f.key === editingKey}
                  defaultFor={effectiveDefaultKinds(f.key, voice, frames ?? [])}
                  onSelect={() => select(f.key)}
                />
              ))}
              {visible.length === 0 && (
                <div className="lb-empty">
                  <b>Nothing matches</b>
                  <span>Clear the search to see every frame.</span>
                </div>
              )}
              <button
                type="button"
                className="lb-fc lb-fc-new"
                aria-pressed={param === "new" || seed !== null}
                onClick={() => select("new")}
              >
                <span className="lb-fc-plus" aria-hidden="true">
                  +
                </span>
                <span className="lb-fc-name">New frame</span>
                <span className="lb-fc-copy">Start from scratch with 2 to 5 beats.</span>
              </button>
              <button
                type="button"
                className="lb-fc lb-fc-learn"
                aria-expanded={learnOpen}
                aria-controls="lb-learn-panel"
                onClick={() => setLearnOpen((open) => !open)}
              >
                <span className="lb-fc-plus" aria-hidden="true">
                  +
                </span>
                <span className="lb-fc-name">Learn from a post</span>
                <span className="lb-fc-copy">Paste a post that worked and get its beats.</span>
              </button>
            </>
          )}
        </div>
      </div>
      {editor && (
        <FrameEditor
          key={editor.id}
          initial={editor.draft}
          usedCount={editor.usedCount}
          takenKeys={(frames ?? []).map((f) => f.key)}
          colors={colors}
          frames={frames ?? []}
          voice={voice}
          onSaved={(key) => select(key)}
          onRemoved={() => {
            setSeed(null);
            window.history.replaceState(null, "", window.location.pathname);
          }}
          onDuplicate={(draft) => {
            setSeed({ id: Date.now(), draft: duplicateFrame(draft) });
            window.history.replaceState(null, "", "?frame=new");
          }}
        />
      )}
    </div>
  );
}
