"use client";

import { useEffect, useRef, useState, type FocusEvent } from "react";
import ThreadWriter from "@/components/features/thread/ThreadWriter";
import { cleanThread, serializeThread } from "@/lib/draftText";
import { studioErrorText } from "@/lib/studioErrors";

/**
 * "Write it myself" for the thread: one box per post (add, remove, reorder),
 * a Save draft button, and a save when the founder leaves the boxes with text
 * in them. Saving stores a real thread draft; Studio then shows it in the
 * normal editor with the same controls, media and Queue as a generated one.
 */
export default function ManualThread({
  onText,
  onSave,
  onRetry,
  retrying,
}: {
  /** Told whenever the text appears or disappears, so Studio can say what that text can and cannot do. */
  onText?: (hasText: boolean) => void;
  /** Store the thread (`---`-separated posts) as the topic's draft. Rejects with the reason when it cannot. */
  onSave?: (text: string) => Promise<void>;
  /** Go back to drafting with the model. */
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const [posts, setPosts] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const postsRef = useRef(posts);
  const saved = useRef(false);
  const onSaveRef = useRef(onSave);
  const text = serializeThread(cleanThread(posts));
  const hasText = text.length > 0;

  useEffect(() => {
    postsRef.current = posts;
    onSaveRef.current = onSave;
  });

  // Leaving the page with unsaved text keeps it as a draft instead of losing it.
  useEffect(
    () => () => {
      if (saved.current || busy.current) return;
      const pending = serializeThread(cleanThread(postsRef.current));
      if (pending) void onSaveRef.current?.(pending).catch(() => undefined);
    },
    []
  );

  function change(next: string[]) {
    setPosts(next);
    onText?.(next.some((p) => p.trim().length > 0));
  }

  async function save() {
    if (!onSave || !hasText || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(text);
      saved.current = true;
    } catch (e) {
      setError(studioErrorText(e, "Couldn't save this draft. Try again."));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  function leave(e: FocusEvent<HTMLDivElement>) {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    void save();
  }

  return (
    <div className="studio-manual studio-manual-thread" onBlur={leave}>
      <ThreadWriter posts={posts} onChange={change} idPrefix="studio-manual" tone="dark" autoFocus disabled={saving} />
      <div className="studio-manual-foot">
        <span className="t-meta">{hasText ? "NOT SAVED YET" : "NOTHING WRITTEN YET"}</span>
        <span className="studio-manual-actions">
          <button type="button" className="sq-btn sq-btn-sm" onClick={() => void copy()} disabled={!hasText}>
            <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
          </button>
          {onSave && (
            <button
              type="button"
              className="sq-btn sq-btn-sm sq-btn-primary"
              onClick={() => void save()}
              disabled={!hasText || saving}
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
        {onRetry && !hasText ? " Or let the model write it." : ""}
      </p>
      {onRetry && !hasText && (
        <button type="button" className="sq-btn sq-btn-sm studio-manual-retry" onClick={onRetry} disabled={retrying}>
          {retrying ? "Retrying…" : "Try drafting again"}
        </button>
      )}
    </div>
  );
}
