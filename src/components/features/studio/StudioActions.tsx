"use client";

import { useId, useState } from "react";
import { ChevronDownIcon } from "@/components/features/studio/glyphs";
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
  saved,
  onMakeDefault,
  onClearDefault,
}: {
  value: number;
  /** The story frame's step count, for the helper line. */
  steps?: number;
  disabled: boolean;
  onChange: (count: number) => void;
  /** The saved default length, when the founder has set one. */
  saved?: number;
  /** Save the shown count as the default for every thread. */
  onMakeDefault?: (count: number) => void;
  /** Go back to letting the story frame decide. */
  onClearDefault?: () => void;
}) {
  const id = useId();
  // Phones keep the helper line and the default link behind "More" so the thread starts higher.
  const [open, setOpen] = useState(false);
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
      <button
        type="button"
        className="studio-posts-more"
        aria-expanded={open}
        aria-controls={`${id}-extra`}
        onClick={() => setOpen((v) => !v)}
      >
        More
        <ChevronDownIcon />
      </button>
      <div id={`${id}-extra`} className="studio-posts-extra" data-open={open || undefined}>
        <span id={`${id}-hint`} className="studio-posts-hint">
          {postsHelper(steps, saved)}
        </span>
        {onMakeDefault && value !== (saved ?? Number.NaN) && (
          <button type="button" className="studio-posts-link" disabled={disabled} onClick={() => onMakeDefault(value)}>
            Make {value} my default
          </button>
        )}
        {onClearDefault && saved !== undefined && value === saved && (
          <button type="button" className="studio-posts-link" disabled={disabled} onClick={onClearDefault}>
            Let the story frame decide
          </button>
        )}
      </div>
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
  posts: {
    value: number;
    steps?: number;
    onChange: (count: number) => void;
    saved?: number;
    onMakeDefault?: (count: number) => void;
    onClearDefault?: () => void;
  };
}) {
  return (
    <div className="studio-gen">
      <PostsControl
        value={posts.value}
        steps={posts.steps}
        disabled={running}
        onChange={posts.onChange}
        saved={posts.saved}
        onMakeDefault={posts.onMakeDefault}
        onClearDefault={posts.onClearDefault}
      />
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
