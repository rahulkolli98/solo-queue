"use client";

import { useRef, useState } from "react";
import AutoTextarea from "@/components/features/studio/AutoTextarea";
import { charLen } from "@/lib/draftText";
import { studioErrorText } from "@/lib/studioErrors";

/**
 * "Write it myself": an empty editable area for a format the model did not
 * write. Saving it (the button, or leaving the box) stores it as a real draft
 * of the topic; Studio then shows it in the normal editor with counters, media
 * and Queue, exactly like a generated one.
 */
export default function ManualDraft({
  label,
  limit,
  autoFocus = true,
  onText,
  onSave,
  onRetry,
  retrying,
}: {
  label: string;
  limit?: number;
  autoFocus?: boolean;
  /** Told whenever the typed text changes, so Studio can say what that text can and cannot do. */
  onText?: (text: string) => void;
  /** Store the text as the topic's draft. Rejects with the reason when it cannot. */
  onSave?: (text: string) => Promise<void>;
  /** Go back to drafting with the model. */
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const length = charLen(text);
  const over = limit !== undefined && length > limit;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function save() {
    if (!onSave || !text.trim() || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(text);
    } catch (e) {
      setError(studioErrorText(e, "Couldn't save this draft. Try again."));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="studio-manual">
      <label className="t-meta studio-manual-label" htmlFor={`manual-${label}`}>
        {label}
      </label>
      <AutoTextarea
        id={`manual-${label}`}
        className="studio-textarea studio-manual-field"
        value={text}
        autoFocus={autoFocus}
        placeholder="Write it here"
        aria-invalid={over || undefined}
        onChange={(e) => {
          setText(e.target.value);
          onText?.(e.target.value);
        }}
        onBlur={() => void save()}
      />
      <div className="studio-manual-foot">
        <span className="t-meta">
          {length}
          {limit ? ` / ${limit.toLocaleString("en-GB")}` : ""}
          {over ? " · OVER THE LIMIT" : ""}
        </span>
        <span className="studio-manual-actions">
          <button type="button" className="sq-btn sq-btn-sm" onClick={() => void copy()} disabled={!text.trim()}>
            <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
          </button>
          {onSave && (
            <button
              type="button"
              className="sq-btn sq-btn-sm sq-btn-primary"
              onClick={() => void save()}
              disabled={!text.trim() || saving}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
          )}
        </span>
      </div>
      {error && (
        <p className="studio-manual-note" role="alert">
          {error}
        </p>
      )}
      <p className="studio-manual-note" role="note">
        {onSave
          ? "Not saved yet. Press Save draft to keep it with this topic. Then you can edit it, add media and queue it like any other draft."
          : "This text is only on this page and is not saved to the topic. Copy it before you leave."}
        {onRetry ? " Or let the model try again." : ""}
      </p>
      {onRetry && (
        <button type="button" className="sq-btn sq-btn-sm studio-manual-retry" onClick={onRetry} disabled={retrying}>
          {retrying ? "Retrying…" : "Try drafting again"}
        </button>
      )}
    </div>
  );
}
