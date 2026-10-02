"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { parseRefusal } from "../../../convex/lib/slots";
import type { Id } from "../../../convex/_generated/dataModel";

export type WeekSlot = FunctionReturnType<typeof api.slots.week>[number];

function fmtDateTime(ts: number): string {
  return new Date(ts)
    .toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
    .toUpperCase();
}

/** Local datetime formatted for <input type="datetime-local">. */
function toInputValue(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SlotCard({ slot }: { slot: WeekSlot }) {
  const reschedule = useMutation(api.slots.reschedule);
  const cancel = useMutation(api.slots.cancel);
  const [moving, setMoving] = useState(false);
  const [when, setWhen] = useState(() => toInputValue(slot.scheduledAt));
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function friendly(err: unknown): string {
    const r = err instanceof Error ? parseRefusal(err) : null;
    return r ? r.message : err instanceof Error ? err.message : "Something went wrong.";
  }

  async function onMove() {
    setBusy(true);
    setError(null);
    try {
      await reschedule({
        id: slot._id as Id<"slots">,
        scheduledAt: new Date(when).getTime(),
      });
      setMoving(false);
    } catch (err) {
      setError(friendly(err));
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    setBusy(true);
    setError(null);
    try {
      await cancel({ id: slot._id as Id<"slots"> });
    } catch (err) {
      setError(friendly(err));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sq-card">
      <div className="sq-card-h">
        <span className="t-body-strong">{slot.topicTitle}</span>
        <span className="sq-tag" style={{ marginLeft: "auto" }}>
          {slot.platform === "threads" ? "THREADS" : "INSTAGRAM"}
        </span>
      </div>
      <span className="t-meta" style={{ color: "var(--color-muted-on-surface)" }}>
        {fmtDateTime(slot.scheduledAt)}
        {!slot.constraintOk ? " · OVER LIMIT" : ""}
      </span>
      <p className="sq-muted" style={{ margin: "4px 0 0" }}>{slot.snippet}…</p>
      {error && (
        <div className="sq-error-box" role="alert">
          {error}
        </div>
      )}
      {!moving ? (
        <div className="sq-row">
          <button
            className="sq-btn"
            style={{ height: 36, fontSize: 13 }}
            onClick={() => {
              setWhen(toInputValue(slot.scheduledAt));
              setError(null);
              setMoving(true);
            }}
          >
            Reschedule
          </button>
          {!confirming ? (
            <button
              className="sq-btn"
              style={{ height: 36, fontSize: 13 }}
              onClick={() => setConfirming(true)}
            >
              Cancel
            </button>
          ) : (
            <button
              className="sq-btn sq-btn-primary"
              style={{ height: 36, fontSize: 13 }}
              disabled={busy}
              onClick={onCancel}
            >
              {busy ? "Cancelling…" : "Confirm cancel"}
            </button>
          )}
        </div>
      ) : (
        <div className="sq-row">
          <input
            type="datetime-local"
            className="sq-field"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            aria-label="New slot time"
          />
          <button
            className="sq-btn sq-btn-primary"
            style={{ height: 36, fontSize: 13 }}
            disabled={busy}
            onClick={onMove}
          >
            {busy ? "Moving…" : "Move"}
          </button>
          <button
            className="sq-btn"
            style={{ height: 36, fontSize: 13 }}
            onClick={() => setMoving(false)}
          >
            Keep
          </button>
        </div>
      )}
    </div>
  );
}
