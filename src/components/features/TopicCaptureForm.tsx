"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";

export default function TopicCaptureForm() {
  const create = useMutation(api.topics.create);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the topic a title first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await create({
        title: title.trim(),
        notes: notes.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
      });
      setTitle("");
      setNotes("");
      setSourceUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the topic.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={run} aria-label="Capture a topic">
      <div className="sq-form-row" style={{ alignItems: "flex-start" }}>
        <label htmlFor="topic-title">Topic</label>
        <input
          id="topic-title"
          className="sq-field"
          style={{ width: "100%", maxWidth: 420 }}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Per-post API fees quietly tax consistency"
          maxLength={200}
        />
      </div>
      <div className="sq-form-row" style={{ alignItems: "flex-start", marginTop: 12 }}>
        <label htmlFor="topic-notes">Notes <span className="sq-muted">(optional)</span></label>
        <textarea
          id="topic-notes"
          className="sq-field"
          style={{ width: "100%", maxWidth: 420, height: 76, paddingTop: 10, paddingBottom: 10, resize: "vertical" }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Tell it like a confession, not a pitch."
          maxLength={2000}
        />
      </div>
      <div className="sq-form-row" style={{ alignItems: "flex-start", marginTop: 12 }}>
        <label htmlFor="topic-url">Source link <span className="sq-muted">(optional)</span></label>
        <input
          id="topic-url"
          className="sq-field"
          style={{ width: "100%", maxWidth: 420 }}
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://…"
          inputMode="url"
          maxLength={500}
        />
      </div>
      {error && (
        <p className="sq-error-box" role="alert" style={{ marginTop: 12, maxWidth: 420 }}>
          {error}
        </p>
      )}
      <div className="sq-row" style={{ marginTop: 12 }}>
        <button type="submit" className="sq-btn sq-btn-dark" disabled={busy}>
          {busy ? "Saving…" : "Save to inbox"}
        </button>
      </div>
    </form>
  );
}
