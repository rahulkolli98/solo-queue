"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon } from "@/components/features/studio/glyphs";
import { ArrowRightIcon, CheckIcon } from "@/components/ui/icons";
import { slotChipText, type BarSummary, type OpenSlot } from "@/lib/studioModel";

/**
 * Board 02's bottom bar: one plain sentence of what to do next (and why Queue
 * is disabled), drafts-ready count, the next open slots (coral ring = fills a
 * gap), "+ blog draft" and the one primary action, Queue N posts.
 * Sticky at the bottom of the panel; above the tab bar on phones.
 */
export default function StudioBottomBar({
  summary,
  slots,
  slotsLoading,
  blogChecked,
  blogLocked,
  onBlog,
  onQueue,
  queuing,
  nextStep,
  nextTone = "info",
  savedText,
}: {
  summary: BarSummary;
  slots: OpenSlot[];
  slotsLoading: boolean;
  blogChecked: boolean;
  /** A blog draft already exists, so the box is ticked and fixed. */
  blogLocked: boolean;
  onBlog: (checked: boolean) => void;
  onQueue: () => void;
  queuing: boolean;
  /** "Your thread is ready. Add a photo or video ...": what to do next. */
  nextStep?: string;
  nextTone?: "info" | "fix" | "wait" | "go" | "done";
  /** "Saved 14:32" once edits are saved: a visible confirmation beside the next step. */
  savedText?: string;
}) {
  const disabled = !summary.canQueue || queuing;
  // Phones show two lines of the next step; this opens the whole sentence (no effect on wide screens).
  const [nextOpen, setNextOpen] = useState(false);

  // The Queue button disables while it works (and once everything is queued), which drops keyboard
  // focus onto the page. If it had focus when pressed, hand focus back to the button, or to the
  // next-step sentence when the button stays disabled, so a keyboard user is not left at the top.
  const queueRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLParagraphElement>(null);
  const pressedWithFocus = useRef(false);
  const wasQueuing = useRef(false);
  useEffect(() => {
    if (queuing) {
      wasQueuing.current = true;
      return;
    }
    if (!wasQueuing.current) return;
    wasQueuing.current = false;
    if (!pressedWithFocus.current) return;
    pressedWithFocus.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    if (queueRef.current && !queueRef.current.disabled) queueRef.current.focus();
    else nextRef.current?.focus();
  }, [queuing]);

  return (
    <div className="studio-bar" role="region" aria-label="Queue">
      {nextStep && (
        <p
          className="studio-bar-next"
          data-tone={nextTone}
          data-open={nextOpen || undefined}
          id="studio-next-step"
          ref={nextRef}
          tabIndex={-1}
        >
          <span className="studio-bar-next-label t-meta">NEXT</span>
          <span className="studio-bar-next-text" aria-live="polite">
            {nextStep}
          </span>
          {savedText && (
            <span className="studio-bar-saved t-meta" role="status">
              <CheckIcon />
              {savedText.toUpperCase()}
            </span>
          )}
        </p>
      )}
      {nextStep && (
        <button
          type="button"
          className="studio-bar-more"
          aria-expanded={nextOpen}
          aria-controls="studio-next-step"
          aria-label={nextOpen ? "Show less of the next step" : "Show the whole next step"}
          onClick={() => setNextOpen((v) => !v)}
        >
          <ChevronDownIcon />
        </button>
      )}
      <div className="studio-bar-count" aria-live="polite">
        <span className="t-title-sm">{summary.headline}</span>
        <span className="t-meta">{summary.sub}</span>
      </div>
      <ul className="studio-chips" aria-label="Next open slots">
        {slots.length > 0 ? (
          slots.map((slot) => (
            <li
              key={`${slot.dayKey}-${slot.platform}-${slot.time}`}
              className="studio-chip"
              data-gap={slot.gap || undefined}
              aria-label={`${slot.when}${slot.gap ? ", fills a gap" : ""}`}
            >
              <span className="t-meta">{slot.dayLabel}</span>
              <span className="t-mono">{slotChipText(slot)}</span>
            </li>
          ))
        ) : (
          <li className="studio-chip studio-chip-none">
            <span className="t-meta">{slotsLoading ? "LOADING SLOTS…" : "NO OPEN SLOTS IN THE NEXT 2 WEEKS"}</span>
          </li>
        )}
      </ul>
      <label className="studio-blogbox">
        <input
          type="checkbox"
          checked={blogChecked}
          disabled={blogLocked}
          onChange={(e) => onBlog(e.target.checked)}
        />
        + blog draft
      </label>
      <button
        type="button"
        className="sq-btn sq-btn-primary studio-queuebtn"
        ref={queueRef}
        disabled={disabled}
        aria-describedby={nextStep ? "studio-next-step" : undefined}
        onClick={(e) => {
          pressedWithFocus.current = document.activeElement === e.currentTarget;
          onQueue();
        }}
      >
        {queuing ? "Queueing…" : summary.buttonLabel}
        <ArrowRightIcon />
      </button>
    </div>
  );
}
