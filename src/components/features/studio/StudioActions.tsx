"use client";

import { useId } from "react";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { CheckIcon } from "@/components/ui/icons";
import { POSTS_MAX, POSTS_MIN, postsHelper } from "@/lib/studioCompose";

export type Pane = "threads" | "instagram" | "blog";

/** Generate / Regenerate. Replacing drafts the founder already has is confirmed by <ReplaceConfirm />. */
export function GenerateButton({
  hasDrafts,
  running,
  onGenerate,
}: {
  hasDrafts: boolean;
  running: boolean;
  onGenerate: () => void;
}) {
  const label = running ? "Generating…" : hasDrafts ? "Regenerate all" : "Generate drafts";
  return (
    <button
      type="button"
      className={`sq-btn${hasDrafts ? "" : " sq-btn-primary"}`}
      disabled={running}
      onClick={onGenerate}
    >
      {label}
    </button>
  );
}

/**
 * "Posts": how many posts the model writes the thread in (2 to 12). It starts
 * on the story frame's own step count; only a count the founder changes is
 * sent to the model.
 */
export function PostsControl({
  value,
  steps,
  disabled,
  onChange,
}: {
  value: number;
  /** The story frame's step count, for the helper line. */
  steps?: number;
  disabled: boolean;
  onChange: (count: number) => void;
}) {
  const id = useId();
  const options = Array.from({ length: POSTS_MAX - POSTS_MIN + 1 }, (_, i) => POSTS_MIN + i);
  return (
    <div className="studio-posts-ctl">
      <label htmlFor={id} className="t-meta studio-posts-label">
        Posts
      </label>
      <select
        id={id}
        className="sq-input studio-posts-select"
        value={value}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <span id={`${id}-hint`} className="studio-posts-hint">
        {postsHelper(steps)}
      </span>
    </div>
  );
}

/** The Posts control beside the Generate / Regenerate button. */
export function GenerateControls({
  hasDrafts,
  running,
  onGenerate,
  posts,
}: {
  hasDrafts: boolean;
  running: boolean;
  onGenerate: () => void;
  posts: { value: number; steps?: number; onChange: (count: number) => void };
}) {
  return (
    <div className="studio-gen">
      <PostsControl value={posts.value} steps={posts.steps} disabled={running} onChange={posts.onChange} />
      <GenerateButton hasDrafts={hasDrafts} running={running} onGenerate={onGenerate} />
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
}: {
  saveText: string;
  saveFailed: boolean;
  onRetrySave: () => void;
  pane: Pane;
  onPane: (pane: Pane) => void;
  counts: { threads: number; instagram: number };
  /** Edits are saved: show a tick beside the "Saved 14:32" text. */
  saved?: boolean;
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
