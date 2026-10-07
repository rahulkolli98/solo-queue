"use client";

import SegmentedControl from "@/components/ui/SegmentedControl";
import { CheckIcon } from "@/components/ui/icons";

export type Pane = "threads" | "instagram" | "blog";

/** Generate / Regenerate. Replacing drafts the founder already has is confirmed by <ReplaceConfirm />. */
export function GenerateButton({
  hasDrafts,
  running,
  onGenerate,
  nothingToWrite = false,
}: {
  hasDrafts: boolean;
  running: boolean;
  onGenerate: () => void;
  /** No format is ticked in the setup, so there is nothing to write. */
  nothingToWrite?: boolean;
}) {
  const label = running ? "Generating…" : hasDrafts ? "Regenerate all" : "Generate drafts";
  return (
    <button
      type="button"
      className={`sq-btn${hasDrafts ? "" : " sq-btn-primary"}`}
      disabled={running || nothingToWrite}
      onClick={onGenerate}
    >
      {label}
    </button>
  );
}

/** The Generate / Regenerate button; what it writes is set in the setup line below the header. */
export function GenerateControls({
  hasDrafts,
  running,
  onGenerate,
  nothingToWrite,
}: {
  hasDrafts: boolean;
  running: boolean;
  onGenerate: () => void;
  nothingToWrite?: boolean;
}) {
  return (
    <div className="studio-gen">
      <GenerateButton hasDrafts={hasDrafts} running={running} onGenerate={onGenerate} nothingToWrite={nothingToWrite} />
    </div>
  );
}

/**
 * The view switch (desktop: Threads + Instagram / Blog; phone: Threads /
 * Instagram / Blog with counts) and the save status (aria-live).
 */
export function StudioToolbar({
  saveText,
  saveFailed,
  onRetrySave,
  pane,
  onPane,
  counts,
  saved = false,
  attention,
}: {
  saveText: string;
  saveFailed: boolean;
  onRetrySave: () => void;
  pane: Pane;
  onPane: (pane: Pane) => void;
  counts: { threads: number; instagram: number };
  /** Edits are saved: show a tick beside the "Saved 14:32" text. */
  saved?: boolean;
  /** Phone: platforms whose drafts need the founder while another pane is showing (their switch segment gets a ring). */
  attention?: { threads?: boolean; instagram?: boolean };
}) {
  return (
    <div className="studio-toolbar">
      <div className="studio-seg-desktop">
        <SegmentedControl
          label="Studio view"
          value={pane === "blog" ? "blog" : "social"}
          onChange={(v) => onPane(v === "blog" ? "blog" : "threads")}
          options={[
            { value: "social", label: "Threads + Instagram" },
            { value: "blog", label: "Blog" },
          ]}
        />
      </div>
      <div
        className="studio-seg-mobile"
        data-attention-threads={attention?.threads || undefined}
        data-attention-instagram={attention?.instagram || undefined}
      >
        <SegmentedControl
          label="Studio view"
          value={pane}
          onChange={onPane}
          options={[
            { value: "threads", label: "Threads", count: counts.threads },
            { value: "instagram", label: "Instagram", count: counts.instagram },
            { value: "blog", label: "Blog" },
          ]}
        />
      </div>
      <span
        className="t-meta studio-save"
        role="status"
        aria-live="polite"
        data-bad={saveFailed || undefined}
        data-saved={(saved && !saveFailed) || undefined}
      >
        {saved && !saveFailed && <CheckIcon />}
        {saveText.toUpperCase()}
        {saveFailed && (
          <button type="button" className="studio-linkbtn" onClick={onRetrySave}>
            Retry
          </button>
        )}
      </span>
    </div>
  );
}
