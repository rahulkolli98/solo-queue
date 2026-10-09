"use client";

import { useMutation } from "convex/react";
import { useId, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { NAME_MAX, type PlanSlide } from "../../../../convex/lib/looks";
import { studioErrorText } from "@/lib/studioErrors";

/** What a look is saved from: a written carousel's slide plan, or a carousel's images as reference images. */
export interface LookParts {
  plan?: PlanSlide[];
  referenceIds?: string[];
}

/**
 * "Save as a look": turn the carousel in front of the founder into a saved look they can pick for later carousels.
 * A button that opens a one-line name form; the look then shows in the Look select in the setup line.
 */
export default function SaveLook({
  label,
  hint,
  parts,
  disabled,
}: {
  label: string;
  /** One line shown with the form: what will be saved. */
  hint: string;
  parts: LookParts;
  disabled?: boolean;
}) {
  const save = useMutation(api.looks.save);
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function run() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the look a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await save({
        name: trimmed,
        plan: parts.plan,
        referenceIds: parts.referenceIds as Id<"mediaAssets">[] | undefined,
      });
      setSaved(trimmed);
      setOpen(false);
      setName("");
    } catch (e) {
      setError(studioErrorText(e, "Couldn't save the look. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <>
        <button
          type="button"
          className="sq-btn sq-btn-sm studio-cr-btn"
          disabled={disabled}
          onClick={() => {
            setSaved(null);
            setOpen(true);
          }}
        >
          {label}
        </button>
        {saved && (
          <p className="studio-cr-note" role="status">
            Saved as “{saved}”. Pick it under Look in the setup line.
          </p>
        )}
      </>
    );
  }

  return (
    <form
      className="studio-savelook"
      onSubmit={(e) => {
        e.preventDefault();
        void run();
      }}
    >
      <label htmlFor={id} className="studio-cr-label">
        Name this look
      </label>
      <p className="studio-cr-note">{hint}</p>
      <div className="studio-actions-row">
        <input
          id={id}
          className="sq-input"
          value={name}
          maxLength={NAME_MAX}
          autoFocus
          disabled={busy}
          placeholder="For example: Calm explainer"
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="sq-btn sq-btn-sm sq-btn-dark studio-cr-btn" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Save look"}
        </button>
        <button type="button" className="sq-btn sq-btn-sm studio-cr-btn" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && (
        <p className="studio-inline-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
