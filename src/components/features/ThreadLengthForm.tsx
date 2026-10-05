"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { refusalText } from "@/lib/refusalText";
import { POSTS_MAX, POSTS_MIN, savedPostCount } from "@/lib/studioCompose";

/**
 * How many posts an AI-written thread has. "Follow the story frame" lets each
 * frame decide (most have 4 steps); a number makes every generated thread that
 * long. Saved to the typed settings (`voice.defaultPostCount`). Threads you
 * write yourself can be any length; this only steers the model.
 */
export default function ThreadLengthForm() {
  const settings = useQuery(api.settings.get);
  const update = useMutation(api.settings.update);
  // null = untouched: show what is saved.
  const [picked, setPicked] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (settings === undefined) {
    return <p className="sq-muted">Loading thread length…</p>;
  }

  const saved = savedPostCount(settings.voice.defaultPostCount);
  const shown = picked ?? (saved !== undefined ? String(saved) : "0");
  const options = Array.from({ length: POSTS_MAX - POSTS_MIN + 1 }, (_, i) => POSTS_MIN + i);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    setMsg(null);
    try {
      await update({ patch: { voice: { ...settings.voice, defaultPostCount: Number(shown) } } });
      setPicked(null);
      setMsg(Number(shown) === 0 ? "Threads will follow the story frame." : `AI-written threads will have ${shown} posts.`);
    } catch (err) {
      setMsg(refusalText(err, "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="sq-slot-form">
      <div className="sq-form-row">
        <label htmlFor="thread-length">Posts per AI-written thread</label>
        <select
          id="thread-length"
          className="sq-field sq-slot-input"
          value={shown}
          onChange={(e) => setPicked(e.target.value)}
        >
          <option value="0">Follow the story frame</option>
          {options.map((n) => (
            <option key={n} value={n}>
              {n} posts
            </option>
          ))}
        </select>
      </div>
      <p className="sq-muted">
        A story frame usually has 4 steps, so threads come out at 4 posts unless you choose a number here. You can still
        change it for a single run in Studio, and threads you write yourself can be any length (up to 25).
      </p>
      <div className="sq-row">
        <button type="submit" className="sq-btn sq-btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save thread length"}
        </button>
        <span className="sq-muted" role="status">
          {msg}
        </span>
      </div>
    </form>
  );
}
