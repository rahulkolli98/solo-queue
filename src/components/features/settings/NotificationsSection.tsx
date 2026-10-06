"use client";

import { useState } from "react";
import {
  LATER_ROWS,
  LIVE_ROWS,
  mergeNotifications,
  parseQuietHours,
  quietHoursProblem,
  withQuietHours,
  withoutQuietHours,
  type Notifications,
} from "@/lib/notificationsEdit";
import SettingSwitch from "./SettingSwitch";
import { statusText, useSectionSave } from "./useSectionSave";

/**
 * Board 06c, in-app only for v1: three alerts that show on Today switch on and
 * off here and save as they change. Post published and Sunday digest are kept
 * on the board but unavailable until they are built; quiet hours are stored
 * for when push notifications arrive.
 */
export default function NotificationsSection() {
  const { section: notifications, status, message, save } = useSectionSave("notifications");
  // null = show what is saved; set once the founder edits a time.
  const [draft, setDraft] = useState<{ from: string; to: string } | null>(null);
  const [error, setError] = useState("");

  if (!notifications) return <p className="sq-muted">Loading notifications…</p>;

  const savedQuiet = parseQuietHours(notifications.quietHours);
  const from = draft?.from ?? savedQuiet?.from ?? "";
  const to = draft?.to ?? savedQuiet?.to ?? "";

  async function run(change: (cur: Notifications) => Notifications) {
    setError("");
    const result = await save(change);
    if (!result.ok) setError(result.message);
    return result;
  }

  async function commitQuiet(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo) return; // wait until both are chosen
    const problem = quietHoursProblem(nextFrom, nextTo);
    if (problem) {
      setError(problem);
      return;
    }
    const result = await run((cur) => withQuietHours(cur, nextFrom, nextTo));
    if (result.ok) setDraft(null);
  }

  return (
    <div className="st-stack">
      <p className="st-save-status sq-muted" role="status" aria-live="polite" data-state={status}>
        {statusText(status, message)}
      </p>

      <section className="sq-card st-rows" aria-label="Notifications">
        {LIVE_ROWS.map((r) => (
          <div key={r.key} className="st-setting st-setting-switch">
            <div className="st-setting-text">
              <span id={`note-${r.key}-label`} className="st-setting-title">
                {r.title}
              </span>
              <small id={`note-${r.key}-help`}>{r.help}</small>
            </div>
            <SettingSwitch
              id={`note-${r.key}`}
              checked={notifications[r.key]}
              labelledBy={`note-${r.key}-label`}
              describedBy={`note-${r.key}-help`}
              onChange={() => {
                // Flip the latest saved value, so two quick toggles do not undo each other.
                run((cur) => mergeNotifications(cur, { [r.key]: !cur[r.key] }));
              }}
            />
          </div>
        ))}
        {LATER_ROWS.map((r) => (
          <div key={r.key} className="st-setting st-setting-switch st-setting-later">
            <div className="st-setting-text">
              <span id={`note-${r.key}-label`} className="st-setting-title">
                {r.title} <span className="sq-tag">Coming later</span>
              </span>
              <small id={`note-${r.key}-help`}>{r.help}</small>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked="false"
              aria-labelledby={`note-${r.key}-label`}
              aria-describedby={`note-${r.key}-help`}
              className="st-switch"
              disabled
            >
              <span className="st-switch-track" aria-hidden="true">
                <span className="st-switch-knob" />
              </span>
            </button>
          </div>
        ))}
        {error && (
          <p className="st-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="sq-card" aria-label="Quiet hours">
        <div className="st-card-head">
          <h3 className="st-eyebrow">Quiet hours</h3>
        </div>
        <p className="sq-muted st-hint" id="quiet-help">
          No push notifications between these times. Email and push arrive later; the times are kept for then.
        </p>
        <div className="st-caps">
          <label className="st-cap">
            <span>From</span>
            <input
              type="time"
              className="sq-input"
              aria-describedby="quiet-help"
              value={from}
              onChange={(e) => {
                setDraft({ from: e.target.value, to });
                void commitQuiet(e.target.value, to);
              }}
            />
          </label>
          <label className="st-cap">
            <span>To</span>
            <input
              type="time"
              className="sq-input"
              aria-describedby="quiet-help"
              value={to}
              onChange={(e) => {
                setDraft({ from, to: e.target.value });
                void commitQuiet(from, e.target.value);
              }}
            />
          </label>
          {notifications.quietHours && (
            <button
              type="button"
              className="sq-btn st-clear"
              onClick={() => {
                setDraft(null);
                void run((cur) => withoutQuietHours(cur));
              }}
            >
              Clear
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
