"use client";

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
  return (
    <div className="studio-bar" role="region" aria-label="Queue">
      {nextStep && (
        <p className="studio-bar-next" data-tone={nextTone} id="studio-next-step">
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
        disabled={disabled}
        aria-describedby={nextStep ? "studio-next-step" : undefined}
        onClick={onQueue}
      >
        {queuing ? "Queueing…" : summary.buttonLabel}
        <ArrowRightIcon />
      </button>
    </div>
  );
}
