"use client";

import { useState, type KeyboardEvent } from "react";
import { useBrowserTz } from "@/lib/useBrowserTz";
import {
  PLATFORMS,
  SLOT_TIMES_MAX,
  WEEK,
  addSlotTime,
  defaultVacation,
  effectiveTz,
  mergeSlotDays,
  mergeSlotDefaults,
  perDayText,
  removeSlotTime,
  timezoneOptions,
  toggleDay,
  vacationFromDates,
  vacationState,
  vacationText,
  vacationToDates,
  type Platform,
} from "@/lib/slotSettingsEdit";
import SettingSwitch from "./SettingSwitch";
import { combineSaves, statusText, useSectionSave, type SaveResult } from "./useSectionSave";

/**
 * Board 06a: when each platform posts. Every control saves as it changes:
 * adding or removing a time, a day toggle, the time zone, the two switches and
 * the vacation dates. Each save sends the whole section it belongs to
 * (`slotDefaults`, `slotDays`, `timezone`, `naturalTiming`, `vacation`).
 */
export default function SlotsSection() {
  const defaults = useSectionSave("slotDefaults");
  const days = useSectionSave("slotDays");
  const timezone = useSectionSave("timezone");
  const natural = useSectionSave("naturalTiming");
  const vacation = useSectionSave("vacation");
  const browserTz = useBrowserTz();
  // Read the clock once per mount; the section only renders after settings load.
  const [now] = useState(() => Date.now());

  const ready = defaults.settings !== undefined;
  const overall = combineSaves(defaults, days, timezone, natural, vacation);

  if (!ready || !defaults.section || !days.section || timezone.section === undefined || natural.section === undefined) {
    return <p className="sq-muted">Loading posting slots…</p>;
  }
  const slotDefaults = defaults.section;
  const slotDays = days.section;
  const savedZone = timezone.section;
  const tz = effectiveTz(savedZone, browserTz);

  return (
    <div className="st-stack">
      <p className="st-save-status sq-muted" role="status" aria-live="polite" data-state={overall.status}>
        {statusText(overall.status, overall.message)}
      </p>

      <div className="st-platforms">
        {PLATFORMS.map((p) => (
          <PlatformCard
            key={p.key}
            platform={p.key}
            label={p.label}
            times={slotDefaults[p.key]}
            activeDays={slotDays[p.key]}
            onTimes={(change) => defaults.save((cur) => mergeSlotDefaults(cur, p.key, change(cur[p.key])))}
            onDays={(change) => days.save((cur) => mergeSlotDays(cur, p.key, change(cur[p.key])))}
          />
        ))}
      </div>

      <section className="sq-card st-rows" aria-label="Timing">
        <TimezoneRow
          saved={savedZone}
          onChange={(value) => timezone.save(() => value)}
        />
        <div className="st-setting st-setting-switch">
          <div className="st-setting-text">
            <span id="natural-label" className="st-setting-title">
              Natural timing
            </span>
            <small id="natural-help">
              Each post goes out up to 2 minutes after its slot so it does not look scheduled.
            </small>
          </div>
          <NaturalSwitch checked={natural.section} onToggle={(next) => natural.save(() => next)} />
        </div>
        <VacationRow
          vacation={vacation.section}
          tz={tz}
          now={now}
          onChange={(next) => vacation.save(() => next)}
        />
      </section>
    </div>
  );
}

function NaturalSwitch({ checked, onToggle }: { checked: boolean; onToggle: (next: boolean) => Promise<SaveResult> }) {
  const [error, setError] = useState("");
  return (
    <>
      <SettingSwitch
        id="natural-timing"
        checked={checked}
        labelledBy="natural-label"
        describedBy="natural-help"
        onChange={async (next) => {
          setError("");
          const result = await onToggle(next);
          if (!result.ok) setError(result.message);
        }}
      />
      {error && (
        <p className="st-error st-setting-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function PlatformCard({
  platform,
  label,
  times,
  activeDays,
  onTimes,
  onDays,
}: {
  platform: Platform;
  label: string;
  times: readonly string[];
  activeDays: readonly number[];
  onTimes: (change: (cur: readonly string[]) => readonly string[]) => Promise<SaveResult>;
  onDays: (change: (cur: readonly number[]) => readonly number[]) => Promise<SaveResult>;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  async function addTime() {
    const checked = addSlotTime(times, draft);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError("");
    let refused = "";
    const result = await onTimes((cur) => {
      // Re-check against the latest list so two quick adds both land.
      const again = addSlotTime(cur, draft);
      if (!again.ok) {
        refused = again.message;
        return cur;
      }
      return again.value;
    });
    if (!result.ok) setError(result.message);
    else if (refused) setError(refused);
    else setDraft("");
  }

  async function removeTime(time: string) {
    const checked = removeSlotTime(times, time);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError("");
    let refused = "";
    const result = await onTimes((cur) => {
      const again = removeSlotTime(cur, time);
      if (!again.ok) {
        refused = again.message;
        return cur;
      }
      return again.value;
    });
    if (!result.ok) setError(result.message);
    else if (refused) setError(refused);
  }

  async function toggle(day: number) {
    setError("");
    const result = await onDays((cur) => toggleDay(cur, day));
    if (!result.ok) setError(result.message);
  }

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTime();
    }
  };

  const id = `slots-${platform}`;
  return (
    <section className="sq-card st-platform" aria-label={`${label} posting slots`} data-platform={platform}>
      <div className="st-platform-head">
        <span className={`st-platform-glyph st-platform-glyph-${platform}`} aria-hidden="true">
          {platform === "threads" ? (
            "@"
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="5" />
              <circle cx="12" cy="12" r="3.5" />
            </svg>
          )}
        </span>
        <h3 className="st-platform-name">{label}</h3>
        <span className="st-mono">{perDayText(times)}</span>
      </div>

      <ul className="st-chips" aria-label={`${label} times`}>
        {times.map((t) => (
          <li key={t} className="st-chip st-time-chip">
            <span>{t}</span>
            <button
              type="button"
              className="st-chip-x"
              aria-label={`Remove ${t} from ${label}`}
              onClick={() => removeTime(t)}
            >
              <span aria-hidden="true">×</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="st-add-row">
        <label className="sq-sr" htmlFor={`${id}-time`}>
          Add a {label} time
        </label>
        <input
          id={`${id}-time`}
          className="sq-input st-time-input"
          type="time"
          value={draft}
          step={60}
          disabled={times.length >= SLOT_TIMES_MAX}
          aria-invalid={error ? true : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onKeyDown={onEnter}
        />
        <button type="button" className="sq-btn sq-btn-sm st-add-btn" onClick={addTime}>
          Add time
        </button>
      </div>
      {error && (
        <p className="st-error" role="alert">
          {error}
        </p>
      )}

      <div className="st-days" role="group" aria-label={`${label} posting days`}>
        {WEEK.map((d) => {
          const on = activeDays.includes(d.day);
          return (
            <button
              key={d.day}
              type="button"
              className="st-day"
              aria-pressed={on}
              aria-label={d.label}
              onClick={() => toggle(d.day)}
            >
              <span aria-hidden="true">{d.letter}</span>
            </button>
          );
        })}
      </div>
      <p className="sq-muted st-hint">
        {activeDays.length === 0 ? `${label} is paused: no days are on.` : "Posts go out on the days that are filled in."}
      </p>
    </section>
  );
}

function TimezoneRow({ saved, onChange }: { saved: string; onChange: (value: string) => Promise<SaveResult> }) {
  const [error, setError] = useState("");
  return (
    <>
      <div className="st-setting">
        <div className="st-setting-text">
          <label htmlFor="slots-timezone">Timezone</label>
          <small>Slot times are read in this zone.</small>
        </div>
        <select
          id="slots-timezone"
          className="sq-input st-select st-select-wide"
          value={saved}
          onChange={async (e) => {
            setError("");
            const result = await onChange(e.target.value);
            if (!result.ok) setError(result.message);
          }}
        >
          {timezoneOptions(saved).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="st-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function VacationRow({
  vacation,
  tz,
  now,
  onChange,
}: {
  vacation: { from: number; to: number } | undefined;
  tz: string;
  now: number;
  onChange: (next: { from: number; to: number } | null) => Promise<SaveResult>;
}) {
  const [draft, setDraft] = useState<{ from?: string; to?: string }>({});
  const [error, setError] = useState("");
  // A window that is already over counts as off.
  const state = vacationState(vacation, now);
  const on = state !== "off";
  const dates = vacation && on ? vacationToDates(vacation, tz) : null;
  const from = draft.from ?? dates?.from ?? "";
  const to = draft.to ?? dates?.to ?? "";
  const status = vacationText(vacation, now, tz);

  async function turn(next: boolean) {
    setError("");
    setDraft({});
    const result = await onChange(next ? defaultVacation(Date.now(), tz) : null);
    if (!result.ok) setError(result.message);
  }

  async function changeDate(which: "from" | "to", value: string) {
    const nextDraft = { ...draft, [which]: value };
    setDraft(nextDraft);
    if (!value) return; // a half-typed date: wait for a whole one
    const checked = vacationFromDates(nextDraft.from ?? dates?.from ?? "", nextDraft.to ?? dates?.to ?? "", tz);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError("");
    const result = await onChange(checked.value);
    if (result.ok) setDraft({});
    else setError(result.message);
  }

  return (
    <>
      <div className="st-setting st-setting-switch">
        <div className="st-setting-text">
          <span id="vacation-label" className="st-setting-title">
            Vacation mode
          </span>
          <small id="vacation-help">
            Pauses all posting. Posts queued inside these dates move to the first open slots after, in the same order.
          </small>
        </div>
        <SettingSwitch
          id="vacation-mode"
          checked={on}
          labelledBy="vacation-label"
          describedBy="vacation-help"
          onChange={turn}
        />
      </div>
      {on && (
        <div className="st-vacation">
          <div className="st-vacation-dates">
            <div className="st-vacation-field">
              <label className="st-field-label" htmlFor="vacation-from">
                From
              </label>
              <input
                id="vacation-from"
                className="sq-input"
                type="date"
                value={from}
                max={to || undefined}
                aria-invalid={error ? true : undefined}
                onChange={(e) => changeDate("from", e.target.value)}
              />
            </div>
            <div className="st-vacation-field">
              <label className="st-field-label" htmlFor="vacation-to">
                To
              </label>
              <input
                id="vacation-to"
                className="sq-input"
                type="date"
                value={to}
                min={from || undefined}
                aria-invalid={error ? true : undefined}
                onChange={(e) => changeDate("to", e.target.value)}
              />
            </div>
          </div>
          {status && (
            <p className="st-vacation-status" role="status" data-testid="vacation-status">
              {status}
            </p>
          )}
        </div>
      )}
      {error && (
        <p className="st-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
