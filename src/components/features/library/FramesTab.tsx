"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  duplicateFrame,
  emptyFrame,
  fitsLine,
  matchesSearch,
  tiltFor,
  type FrameDraft,
} from "@/lib/libraryBoard";
import FrameEditor from "./FrameEditor";
import { PostcardSkeletons } from "./PublishedTab";
import type { Frame, LibraryFilters, Pillar } from "./types";

function toDraft(frame: Frame): FrameDraft {
  return {
    key: frame.key,
    name: frame.name,
    beats: frame.beats.map((b) => ({ ...b })),
    fits: [...frame.fits],
    color: frame.color,
  };
}

function FrameCard({
  frame,
  index,
  selected,
  onSelect,
}: {
  frame: Frame;
  index: number;
  selected: boolean;
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
}: {
  filters: LibraryFilters;
  pillars: Pillar[];
  frames: Frame[] | undefined;
}) {
  const searchParams = useSearchParams();
  const param = searchParams.get("frame");
  // A duplicate is an unsaved copy held here until it is saved or dropped.
  const [seed, setSeed] = useState<{ id: number; draft: FrameDraft } | null>(null);

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
        <div className="lb-cards lb-cards-frames">
          {frames === undefined ? (
            <PostcardSkeletons />
          ) : frames.length === 0 ? (
            <p className="lb-note" role="status">
              Setting up your six starter frames…
            </p>
          ) : (
            <>
              {visible.map((f, i) => (
                <FrameCard
                  key={f.key}
                  frame={f}
                  index={i}
                  selected={f.key === editingKey}
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
              <div className="lb-fc lb-fc-learn" aria-disabled="true">
                <span className="lb-fc-name">Learn from a post</span>
                <span className="t-mono">COMING LATER</span>
                <span className="t-body-sm">
                  Pull the beats out of a post that worked. Until then, build the frame by hand.
                </span>
              </div>
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
          onSaved={(key) => select(key)}
          onDuplicate={(draft) => {
            setSeed({ id: Date.now(), draft: duplicateFrame(draft) });
            window.history.replaceState(null, "", "?frame=new");
          }}
        />
      )}
    </div>
  );
}
