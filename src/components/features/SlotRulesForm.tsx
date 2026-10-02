"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { parseTimeList } from "@/lib/timeList";
import { refusalText } from "@/lib/refusalText";

/**
 * Default posting times per platform, saved to the typed settings
 * (`slotDefaults`). Times are 24-hour HH:MM separated by commas; the queue
 * uses them in the saved time zone. (The full Settings sections arrive with
 * the Settings rebuild.)
 */
export default function SlotRulesForm() {
  const settings = useQuery(api.settings.get);
  const update = useMutation(api.settings.update);
  // null = untouched: show what is saved. Editing replaces it.
  const [threadsDraft, setThreadsDraft] = useState<string | null>(null);
  const [instagramDraft, setInstagramDraft] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (settings === undefined) {
    return <p className="sq-muted">Loading slot rules…</p>;
  }

  const threads = threadsDraft ?? settings.slotDefaults.threads.join(", ");
  const instagram = instagramDraft ?? settings.slotDefaults.instagram.join(", ");

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const t = parseTimeList(threads);
    const i = parseTimeList(instagram);
    if (!t.ok) {
      setMsg(t.message);
      return;
    }
    if (!i.ok) {
      setMsg(i.message);
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await update({ patch: { slotDefaults: { threads: t.times, instagram: i.times } } });
      setThreadsDraft(null);
      setInstagramDraft(null);
      setMsg("Slot times saved.");
    } catch (err) {
      setMsg(refusalText(err, "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={run} className="sq-slot-form">
      <div className="sq-form-row">
        <label htmlFor="slot-threads">Threads times</label>
        <input
          id="slot-threads"
          className="sq-field sq-slot-input"
          value={threads}
          placeholder="09:30, 13:00, 19:00"
          onChange={(e) => setThreadsDraft(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
        />
      </div>
      <div className="sq-form-row">
        <label htmlFor="slot-instagram">Instagram times</label>
        <input
          id="slot-instagram"
          className="sq-field sq-slot-input"
          value={instagram}
          placeholder="12:00, 18:30"
          onChange={(e) => setInstagramDraft(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
        />
      </div>
      <p className="sq-muted">24-hour times, separated by commas, in your saved time zone ({settings.timezone}).</p>
      <div className="sq-row">
        <button type="submit" className="sq-btn sq-btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save slot times"}
        </button>
        <span className="sq-muted" role="status">
          {msg}
        </span>
      </div>
    </form>
  );
}
