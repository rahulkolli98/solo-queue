"use client";

import { FRAME_FORMATS, type DefaultToggle, type FrameFormat } from "@/lib/frameDefaults";

/**
 * "Default for": one toggle per format the frame fits. On means this frame is what new drafts of that
 * format start with. A toggle applies at once (no Save frame). A toggle that is on only through the
 * older single default has nothing saved to clear, so it is disabled and says how to change it.
 */
export function FrameDefaultToggles({
  toggles,
  unsaved,
  busy,
  error,
  onToggle,
}: {
  toggles: DefaultToggle[];
  /** A new frame has no key yet, so it cannot be a default. */
  unsaved: boolean;
  busy: boolean;
  error: string | null;
  onToggle: (kind: FrameFormat, on: boolean) => void;
}) {
  const inherited = toggles.filter((t) => t.on && t.inherited).map((t) => t.label);
  return (
    <div className="lb-field" role="group" aria-labelledby="lb-defaults-title">
      <span className="lb-field-title" id="lb-defaults-title">
        Default for
      </span>
      <div className="lb-tgl-row">
        {toggles.map((t) => (
          <button
            key={t.kind}
            type="button"
            className="lb-tgl"
            aria-pressed={t.on}
            disabled={unsaved || busy || (t.on && t.inherited)}
            onClick={() => onToggle(t.kind, !t.on)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {unsaved ? (
        <p className="lb-hint">Save the frame first.</p>
      ) : (
        <p className="lb-hint">New drafts of that format start with this frame. Optional.</p>
      )}
      {inherited.length > 0 && (
        <p className="lb-hint">
          {inherited.join(", ")} already use{inherited.length === 1 ? "s" : ""} this frame. Pick another frame as the
          default to change this.
        </p>
      )}
      {error && (
        <p className="sq-error-box" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** The first choice for a new frame: which format it is for. Pre-selected, so nothing is mandatory. */
export function FrameFormatChoice({
  format,
  onChoose,
}: {
  format: FrameFormat;
  onChoose: (kind: FrameFormat) => void;
}) {
  return (
    <div className="lb-field" role="radiogroup" aria-labelledby="lb-format-title">
      <span className="lb-field-title" id="lb-format-title">
        This frame is for
      </span>
      <div className="lb-tgl-row">
        {FRAME_FORMATS.map((f) => (
          <button
            key={f.kind}
            type="button"
            role="radio"
            className="lb-tgl"
            aria-checked={f.kind === format}
            onClick={() => onChoose(f.kind)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
