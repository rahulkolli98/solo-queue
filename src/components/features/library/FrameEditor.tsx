"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import FormField from "@/components/ui/FormField";
import { CloseIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import {
  FRAME_FITS,
  MAX_BEATS,
  frameFormErrors,
  hasErrors,
  keyFromName,
  moveBeat,
  toggleFit,
  type FrameDraft,
  type FrameFormErrors,
} from "@/lib/libraryBoard";
import { refusalText } from "@/lib/refusalText";
import { api } from "../../../../convex/_generated/api";

/**
 * The frame editor rail (board 07o): name, two to five beats with a hint
 * each (reorder with the arrows), where the frame fits, Save and Duplicate.
 * The key of an existing frame never changes; a new one is made from its name.
 */
export default function FrameEditor({
  initial,
  usedCount,
  takenKeys,
  colors,
  onSaved,
  onDuplicate,
}: {
  initial: FrameDraft;
  usedCount: number;
  takenKeys: string[];
  colors: string[];
  onSaved: (key: string) => void;
  onDuplicate: (draft: FrameDraft) => void;
}) {
  const save = useMutation(api.frames.save);
  const { toast } = useToast();
  const [draft, setDraft] = useState<FrameDraft>(initial);
  const [errors, setErrors] = useState<FrameFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = draft.key === null;

  function patch(next: Partial<FrameDraft>) {
    setDraft((d) => ({ ...d, ...next }));
    setErrors({});
    setServerError(null);
  }

  function setBeat(i: number, field: "label" | "hint", value: string) {
    patch({ beats: draft.beats.map((b, j) => (j === i ? { ...b, [field]: value } : b)) });
  }

  async function onSave() {
    const found = frameFormErrors(draft);
    if (hasErrors(found)) {
      setErrors(found);
      return;
    }
    setBusy(true);
    setServerError(null);
    try {
      const key = draft.key ?? keyFromName(draft.name, takenKeys);
      const res = await save({
        key,
        name: draft.name.trim(),
        beats: draft.beats.map((b) => ({ label: b.label.trim(), hint: b.hint.trim() })),
        fits: draft.fits,
        color: draft.color,
      });
      toast({
        title: res.created ? "Frame created" : "Frame saved",
        detail: res.created
          ? undefined
          : "Posts already written keep the frame they used; new drafts follow the new beats.",
      });
      onSaved(res.key);
    } catch (err) {
      setServerError(refusalText(err, "Could not save the frame. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="lb-rail lb-editor" id="lb-editor" aria-label={isNew ? "New frame" : "Edit frame"}>
      <div className="lb-rail-head">
        <h2 className="t-eyebrow">{isNew ? "New frame" : "Edit frame"}</h2>
        {!isNew && <span className="t-meta lb-rail-count">USED {usedCount}×</span>}
      </div>

      <FormField label="Name" error={errors.name}>
        <input type="text" value={draft.name} maxLength={60} onChange={(e) => patch({ name: e.target.value })} />
      </FormField>

      <div className="lb-field" role="group" aria-labelledby="lb-beats-title">
        <span className="lb-field-title" id="lb-beats-title">
          Beats
        </span>
        <ol className="lb-beat-list">
          {draft.beats.map((beat, i) => (
            <li key={i} className="lb-beat-row">
              <span className="lb-beat-num" aria-hidden="true">
                {i + 1} ·
              </span>
              <div className="lb-beat-fields">
                <input
                  type="text"
                  aria-label={`Beat ${i + 1} name`}
                  placeholder="Name"
                  value={beat.label}
                  maxLength={30}
                  onChange={(e) => setBeat(i, "label", e.target.value)}
                />
                <input
                  type="text"
                  aria-label={`Beat ${i + 1} hint`}
                  placeholder="What goes here"
                  value={beat.hint}
                  maxLength={200}
                  onChange={(e) => setBeat(i, "hint", e.target.value)}
                />
              </div>
              <div className="lb-beat-ctrl">
                <button
                  type="button"
                  className="lb-icon"
                  aria-label={`Move beat ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => patch({ beats: moveBeat(draft.beats, i, -1) })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="lb-icon"
                  aria-label={`Move beat ${i + 1} down`}
                  disabled={i === draft.beats.length - 1}
                  onClick={() => patch({ beats: moveBeat(draft.beats, i, 1) })}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="lb-icon"
                  aria-label={`Remove beat ${i + 1}`}
                  disabled={draft.beats.length <= 2}
                  onClick={() => patch({ beats: draft.beats.filter((_, j) => j !== i) })}
                >
                  <CloseIcon />
                </button>
              </div>
            </li>
          ))}
        </ol>
        {errors.beats && (
          <span className="sq-formfield-error" role="alert">
            {errors.beats}
          </span>
        )}
        <button
          type="button"
          className="lb-tgl lb-tgl-add"
          disabled={draft.beats.length >= MAX_BEATS}
          onClick={() => patch({ beats: [...draft.beats, { label: "", hint: "" }] })}
        >
          + Add beat
        </button>
      </div>

      <div className="lb-field" role="group" aria-labelledby="lb-fits-title">
        <span className="lb-field-title" id="lb-fits-title">
          Use for
        </span>
        <div className="lb-tgl-row">
          {FRAME_FITS.map((f) => (
            <button
              key={f.value}
              type="button"
              className="lb-tgl"
              aria-pressed={draft.fits.includes(f.value)}
              onClick={() => patch({ fits: toggleFit(draft.fits, f.value) })}
            >
              {f.label}
            </button>
          ))}
        </div>
        {errors.fits && (
          <span className="sq-formfield-error" role="alert">
            {errors.fits}
          </span>
        )}
      </div>

      <div className="lb-field" role="group" aria-labelledby="lb-color-title">
        <span className="lb-field-title" id="lb-color-title">
          Colour
        </span>
        <div className="lb-tgl-row">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              className="lb-swatch"
              aria-label={c.replace("pillar-", "")}
              aria-pressed={draft.color === c}
              style={{ background: `var(--color-${c})` }}
              onClick={() => patch({ color: c })}
            />
          ))}
        </div>
      </div>

      {serverError && (
        <p className="sq-error-box" role="alert">
          {serverError}
        </p>
      )}
      <div className="lb-editor-actions">
        <button type="button" className="sq-btn lb-btn-yellow" disabled={busy} onClick={() => void onSave()}>
          {busy ? "Saving…" : "Save frame"}
        </button>
        <button type="button" className="sq-btn sq-btn-light" disabled={busy} onClick={() => onDuplicate(draft)}>
          Duplicate
        </button>
      </div>
      {!isNew && (
        <p className="lb-hint">Edits version the frame. Posts already written keep the frame they used.</p>
      )}
    </aside>
  );
}
