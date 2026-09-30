"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";

export default function SlotRulesForm() {
  const defaults = useQuery(api.settings.getSlotDefaults);
  const save = useMutation(api.settings.setSlotDefaults);
  const [threads, setThreads] = useState("");
  const [instagram, setInstagram] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (defaults && threads === "" && instagram === "") {
      setThreads(defaults.threads);
      setInstagram(defaults.instagram);
    }
  }, [defaults, threads, instagram]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await save({ threads, instagram });
      setMsg("Slot defaults saved.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  if (defaults === undefined) {
    return <p className="sq-muted">Loading slot rules…</p>;
  }

  return (
    <form onSubmit={run} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="sq-form-row">
        <label htmlFor="slot-threads">Threads default time</label>
        <input
          id="slot-threads"
          type="time"
          className="sq-field"
          value={threads}
          onChange={(e) => setThreads(e.target.value)}
          required
        />
      </div>
      <div className="sq-form-row">
        <label htmlFor="slot-instagram">Instagram default time</label>
        <input
          id="slot-instagram"
          type="time"
          className="sq-field"
          value={instagram}
          onChange={(e) => setInstagram(e.target.value)}
          required
        />
      </div>
      <div className="sq-row">
        <button type="submit" className="sq-btn sq-btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save slot rules"}
        </button>
        {msg && <span className="sq-muted">{msg}</span>}
      </div>
    </form>
  );
}
