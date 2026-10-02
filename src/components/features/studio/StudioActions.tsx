"use client";

import SegmentedControl from "@/components/ui/SegmentedControl";

export type Pane = "threads" | "instagram" | "blog";

/** Generate / Regenerate: Regenerate is two-tap because it replaces the unqueued drafts. */
export function GenerateButton({
  hasDrafts,
  running,
  armed,
  onGenerate,
}: {
  hasDrafts: boolean;
  running: boolean;
  /** First tap of a two-tap Regenerate. */
  armed: boolean;
  onGenerate: () => void;
}) {
  const label = running
    ? "Generating…"
    : armed
      ? "Tap again to replace"
      : hasDrafts
        ? "Regenerate all"
        : "Generate drafts";
  return (
    <button
      type="button"
      className={`sq-btn${hasDrafts ? "" : " sq-btn-primary"}${armed ? " studio-armed" : ""}`}
      disabled={running}
      title={armed ? "Replaces the drafts that are not queued yet" : undefined}
      onClick={onGenerate}
    >
      {label}
    </button>
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
}: {
  saveText: string;
  saveFailed: boolean;
  onRetrySave: () => void;
  pane: Pane;
  onPane: (pane: Pane) => void;
  counts: { threads: number; instagram: number };
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
      <div className="studio-seg-mobile">
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
      <span className="t-meta studio-save" role="status" aria-live="polite" data-bad={saveFailed || undefined}>
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
