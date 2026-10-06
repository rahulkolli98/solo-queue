"use client";

import { useQuery } from "convex/react";
import { useState, type CSSProperties } from "react";
import { api } from "../../../../convex/_generated/api";
import {
  CLEANUP_HELP,
  STORAGE_LIMIT_LABEL,
  cleanupOptions,
  cleanupValue,
  meterPercent,
  storageText,
  withCleanupAfterDays,
  type Media,
} from "@/lib/dataSettings";
import { statusText, useSectionSave } from "./useSectionSave";

/**
 * Board 06f: where hosted files live, how full the free allowance is, and
 * when to tidy files up after their posts are published. The own-bucket
 * choice is kept on the board but unavailable. Image crop has no control yet.
 * The select saves as it changes and always sends the whole `media` object, so
 * the saved `igCrop` is kept.
 */
export default function MediaSection() {
  const { section: media, status, message, save } = useSectionSave("media");
  const summary = useQuery(api.media.storageSummary);
  const [error, setError] = useState("");

  if (!media) return <p className="sq-muted">Loading media settings…</p>;

  async function run(change: (cur: Media) => Media) {
    setError("");
    const result = await save(change);
    if (!result.ok) setError(result.message);
  }

  return (
    <div className="st-stack">
      <p className="st-save-status sq-muted" role="status" aria-live="polite" data-state={status}>
        {statusText(status, message)}
      </p>

      <section aria-label="Where files live">
        <div className="st-choices" role="radiogroup" aria-label="Where files live">
          <label className="st-choice" data-selected="true">
            <input type="radio" name="hosting" value="solo" checked readOnly className="st-choice-radio" />
            <span className="st-choice-text">
              <span className="st-choice-head">
                <span className="st-choice-title">Solo Queue hosting</span>
                <span className="st-pill st-pill-use">● IN USE</span>
              </span>
              <small>
                Files are stored on your own Solo Queue backend and served on public links Meta can fetch.
              </small>
            </span>
          </label>
          <label className="st-choice" data-disabled="true">
            <input type="radio" name="hosting" value="bucket" disabled checked={false} readOnly className="st-choice-radio" />
            <span className="st-choice-text">
              <span className="st-choice-head">
                <span className="st-choice-title">Your own bucket</span>
                <span className="st-pill st-pill-outline">S3 · R2</span>
              </span>
              <small>Bring your own storage and keep files under your control.</small>
              <span className="sq-tag">Coming later</span>
            </span>
          </label>
        </div>
      </section>

      <section className="sq-card" aria-label="Storage used">
        <div className="st-card-head">
          <h3 className="st-eyebrow">Storage</h3>
        </div>
        {summary === undefined ? (
          <p className="sq-muted st-hint" role="status">
            Checking storage…
          </p>
        ) : (
          <>
            <p className="st-meter-text">{storageText(summary)}</p>
            <div
              className="st-meter"
              role="meter"
              aria-label="Hosted storage used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(meterPercent(summary.bytes))}
              aria-valuetext={`${storageText(summary)} ${STORAGE_LIMIT_LABEL}`}
            >
              <span
                className="st-meter-fill"
                style={{ "--st-meter": `${meterPercent(summary.bytes)}%` } as CSSProperties}
              />
            </div>
            <p className="sq-muted st-hint">{STORAGE_LIMIT_LABEL}</p>
          </>
        )}
      </section>

      <section className="sq-card st-rows" aria-label="Tidy up after posting">
        <div className="st-setting">
          <div className="st-setting-text">
            <label htmlFor="media-cleanup">Tidy up after posting</label>
            <small id="media-cleanup-help">{CLEANUP_HELP}</small>
          </div>
          <select
            id="media-cleanup"
            className="sq-input st-select st-select-wide"
            aria-describedby="media-cleanup-help"
            value={cleanupValue(media.cleanupAfterDays)}
            onChange={(e) => {
              const value = e.target.value;
              void run((cur) => withCleanupAfterDays(cur, value));
            }}
          >
            {cleanupOptions(media.cleanupAfterDays).map((o) => (
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
      </section>
    </div>
  );
}
