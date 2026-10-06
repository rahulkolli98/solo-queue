"use client";

import { useState, type KeyboardEvent } from "react";
import {
  clampDailyCap,
  dailyCapClampNote,
  dailyCapLimit,
  dailyCapProblem,
  evergreenLabel,
  evergreenOptions,
  mergeDailyCap,
  mergeRules,
  type Platform,
  type Rules,
} from "@/lib/slotSettingsEdit";
import SettingSwitch from "./SettingSwitch";
import { statusText, useSectionSave, type SaveResult } from "./useSectionSave";

type SwitchKey = "mixPillars" | "oneReelPerDay" | "pauseOnFailure";

const SWITCHES: ReadonlyArray<{ key: SwitchKey; title: string; help: string }> = [
  {
    key: "mixPillars",
    title: "Mix pillars",
    help: "Never two posts from the same pillar in a row when the queue fills slots.",
  },
  {
    key: "oneReelPerDay",
    title: "One reel a day",
    help: "Never schedule two reels on the same day.",
  },
  {
    key: "pauseOnFailure",
    title: "Pause on failure",
    help: "Hold the queue if a post fails to publish, until you retry or cancel it.",
  },
];

/**
 * Board 06b: how the queue decides what goes out next, in the board's order
 * (Mix pillars, Evergreen rest, One reel a day, Pause on failure, the daily
 * caps). Every control saves as
 * it changes (switches and the select at once; the two caps when you leave the
 * field or press Enter). Each save sends the whole `rules` object, including
 * `fillGaps`, which has no control yet and keeps its saved value.
 */
export default function QueueRulesSection() {
  const { section: rules, status, message, save } = useSectionSave("rules");
  const [error, setError] = useState("");

  if (!rules) return <p className="sq-muted">Loading queue rules…</p>;

  async function run(change: (cur: Rules) => Rules): Promise<SaveResult> {
    setError("");
    const result = await save(change);
    if (!result.ok) setError(result.message);
    return result;
  }

  const switchRow = (s: (typeof SWITCHES)[number]) => (
    <div key={s.key} className="st-setting st-setting-switch">
      <div className="st-setting-text">
        <span id={`rule-${s.key}-label`} className="st-setting-title">
          {s.title}
        </span>
        <small id={`rule-${s.key}-help`}>{s.help}</small>
      </div>
      <SettingSwitch
        id={`rule-${s.key}`}
        checked={rules[s.key]}
        labelledBy={`rule-${s.key}-label`}
        describedBy={`rule-${s.key}-help`}
        onChange={() => {
          // Flip the latest saved value, so two quick toggles do not undo each other.
          run((cur) => mergeRules(cur, { [s.key]: !cur[s.key] }));
        }}
      />
    </div>
  );

  return (
    <div className="st-stack">
      <p className="st-save-status sq-muted" role="status" aria-live="polite" data-state={status}>
        {statusText(status, message)}
      </p>

      <section className="sq-card st-rows" aria-label="Queue rules">
        {switchRow(SWITCHES[0])}

        <div className="st-setting">
          <div className="st-setting-text">
            <label htmlFor="rule-evergreen">Evergreen rest</label>
            <small id="rule-evergreen-help">Requeue evergreen posts after this many days.</small>
          </div>
          <select
            id="rule-evergreen"
            className="sq-input st-select"
            aria-describedby="rule-evergreen-help"
            value={String(rules.evergreenRestDays)}
            onChange={(e) => {
              const days = Number(e.target.value);
              run((cur) => mergeRules(cur, { evergreenRestDays: days }));
            }}
          >
            {evergreenOptions(rules.evergreenRestDays).map((n) => (
              <option key={n} value={String(n)}>
                {evergreenLabel(n)}
              </option>
            ))}
          </select>
        </div>

        {switchRow(SWITCHES[1])}
        {switchRow(SWITCHES[2])}

        <div className="st-setting st-setting-caps">
          <div className="st-setting-text">
            <span id="caps-label" className="st-setting-title">
              Personal daily cap
            </span>
            <small id="caps-help">
              Stay well under Meta&apos;s limits (Threads {dailyCapLimit("threads")}, Instagram{" "}
              {dailyCapLimit("instagram")}).
            </small>
          </div>
          <div className="st-caps">
            <CapField
              platform="threads"
              label="Threads"
              saved={rules.dailyCap.threads}
              onSave={(n) => run((cur) => mergeDailyCap(cur, "threads", n))}
            />
            <CapField
              platform="instagram"
              label="Instagram"
              saved={rules.dailyCap.instagram}
              onSave={(n) => run((cur) => mergeDailyCap(cur, "instagram", n))}
            />
          </div>
        </div>
        {error && (
          <p className="st-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function CapField({
  platform,
  label,
  saved,
  onSave,
}: {
  platform: Platform;
  label: string;
  saved: number;
  onSave: (value: number) => Promise<SaveResult>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const [note, setNote] = useState("");
  const id = `cap-${platform}`;

  async function commit() {
    if (draft === null) return;
    const clamped = clampDailyCap(draft, platform);
    if (clamped === null) {
      setProblem(dailyCapProblem(platform));
      setNote("");
      return;
    }
    setProblem("");
    if (clamped === saved) {
      setDraft(null);
      setNote(dailyCapClampNote(draft, clamped, platform) ?? "");
      return;
    }
    const result = await onSave(clamped);
    if (result.ok) {
      setNote(dailyCapClampNote(draft, clamped, platform) ?? "");
      setDraft(null);
    } else {
      setProblem(result.message);
    }
  }

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  };

  return (
    <div className="st-cap">
      <label className="st-field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="sq-input st-cap-input"
        type="number"
        inputMode="numeric"
        min={1}
        max={dailyCapLimit(platform)}
        step={1}
        value={draft ?? String(saved)}
        aria-describedby="caps-help"
        aria-invalid={problem ? true : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          setNote("");
        }}
        onBlur={commit}
        onKeyDown={onEnter}
      />
      {problem && (
        <p className="st-error" role="alert">
          {problem}
        </p>
      )}
      {note && (
        <p className="sq-muted st-hint" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
