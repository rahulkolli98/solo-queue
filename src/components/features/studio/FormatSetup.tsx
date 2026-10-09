"use client";

import { useId } from "react";
import { FRAME_EXPLAINER, type DraftKind } from "@/lib/studioModel";
import { POSTS_MAX, POSTS_MIN } from "@/lib/studioCompose";
import { BRIEF_MAX } from "../../../../convex/lib/carouselDraft";
import { NO_FRAME, setupSummary, type SetupRow } from "@/lib/studioSetup";

const POST_COUNTS = Array.from({ length: POSTS_MAX - POSTS_MIN + 1 }, (_, i) => POSTS_MIN + i);
const SLIDE_COUNTS = Array.from({ length: 10 }, (_, i) => 1 + i);

/**
 * What this run writes. One line says it all (the defaults, so Generate works untouched); Change opens one
 * row per format: tick it, pick its story frame, set the thread length, and Make default to keep the row
 * as the default for next time.
 */
export default function FormatSetup({
  rows,
  open,
  onToggle,
  disabled,
  onInclude,
  onFrame,
  onCount,
  onBrief,
  onLook,
  onMakeDefault,
}: {
  rows: SetupRow[];
  open: boolean;
  onToggle: () => void;
  /** Generation is running: the setup cannot change under it. */
  disabled: boolean;
  onInclude: (kind: DraftKind, on: boolean) => void;
  onFrame: (kind: DraftKind, key: string) => void;
  onCount: (kind: DraftKind, count: number) => void;
  /** The carousel's own description of how it should read and look. */
  onBrief: (kind: DraftKind, text: string) => void;
  /** The carousel's saved look ("" for none). */
  onLook: (kind: DraftKind, key: string) => void;
  onMakeDefault: (kind: DraftKind) => void;
}) {
  const id = useId();
  return (
    <section className="studio-setup" aria-label="What to write">
      <div className="studio-setup-head">
        <span className="t-meta studio-setup-label">WRITING</span>
        <p className="studio-setup-line">{setupSummary(rows)}</p>
        <button
          type="button"
          className="studio-linkbtn studio-setup-change"
          aria-expanded={open}
          aria-controls={`${id}-rows`}
          onClick={onToggle}
        >
          Change
        </button>
      </div>
      {open && (
        <div id={`${id}-rows`} className="studio-setup-rows">
          <p className="studio-setup-help sq-muted">{FRAME_EXPLAINER}</p>
          {rows.map((row) => (
            <div className="studio-setup-row" key={row.kind} data-kind={row.kind}>
              <label className="studio-setup-check">
                <input
                  type="checkbox"
                  checked={row.include}
                  disabled={disabled}
                  onChange={(e) => onInclude(row.kind, e.target.checked)}
                />
                <span>{row.label}</span>
              </label>
              {row.frameOptions.length > 0 ? (
                <select
                  className="sq-input studio-setup-select"
                  aria-label={`${row.label} story frame`}
                  value={row.noFrame ? NO_FRAME : (row.frame?.key ?? "")}
                  disabled={disabled || !row.include}
                  onChange={(e) => onFrame(row.kind, e.target.value)}
                >
                  {!row.frame && !row.noFrame && <option value="">No story frame</option>}
                  {row.frameOptions.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.name}
                      {f.isDefault ? " (default)" : ""}
                    </option>
                  ))}
                  {row.kind === "carousel" && <option value={NO_FRAME}>No frame: I will describe it</option>}
                </select>
              ) : (
                <span className="sq-muted studio-setup-none">
                  {row.kind === "blog" ? "No story frame" : "No story frame fits yet"}
                </span>
              )}
              {(row.kind === "threads" || row.kind === "carousel") && row.count !== undefined ? (
                <label className="studio-setup-count">
                  <span className="t-meta">{row.kind === "carousel" ? "Slides" : "Posts"}</span>
                  <select
                    className="sq-input studio-setup-select studio-setup-num"
                    value={row.count}
                    disabled={disabled || !row.include}
                    onChange={(e) => onCount(row.kind, Number(e.target.value))}
                  >
                    {(row.kind === "carousel" ? SLIDE_COUNTS : POST_COUNTS).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span aria-hidden="true" />
              )}
              <button
                type="button"
                className="studio-linkbtn studio-setup-default"
                disabled={disabled || !row.changed}
                onClick={() => onMakeDefault(row.kind)}
              >
                Make default
              </button>
              {row.kind === "carousel" && (
                <label className="studio-setup-look">
                  <span className="t-meta">LOOK</span>
                  <select
                    className="sq-input studio-setup-select"
                    aria-label="Carousel look"
                    value={row.look}
                    disabled={disabled || !row.include}
                    onChange={(e) => onLook(row.kind, e.target.value)}
                  >
                    <option value="">No look</option>
                    {row.lookOptions.map((l) => (
                      <option key={l.key} value={l.key}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                  <span className="studio-setup-brief-hint sq-muted">
                    {row.lookOptions.length === 0
                      ? "A look is a saved design: a slide plan, a design document or reference images. Make one in Library → Frames, or save one from a carousel here."
                      : "A saved design for the carousel: a slide plan, a design document or reference images."}
                  </span>
                </label>
              )}
              {row.kind === "carousel" && (
                <label className="studio-setup-brief">
                  <span className="t-meta">HOW YOU WANT IT</span>
                  <textarea
                    className="sq-input"
                    rows={2}
                    maxLength={BRIEF_MAX}
                    value={row.brief}
                    disabled={disabled || !row.include}
                    placeholder="Optional. For example: an explainer for beginners, big numbers, calm colours, no personal story."
                    onChange={(e) => onBrief(row.kind, e.target.value)}
                  />
                  <span className="studio-setup-brief-hint sq-muted">
                    Say what you want: the shape, the colours, what to stress or leave out. It can change how the carousel reads, never what is true.
                  </span>
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
