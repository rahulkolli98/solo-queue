"use client";

import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import FormField from "@/components/ui/FormField";
import { refusalCode, refusalText } from "@/lib/refusalText";
import { briefParagraphs, wordCount } from "@/lib/researchBoard";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type Mode = "read" | "edit" | "confirm";

/**
 * The hole-punched brief paper. The brief is generated from the sources and
 * the founder can rewrite it; once edited, regenerating asks first
 * (research.brief refuses with BRIEF_EDITED unless forced).
 */
export default function BriefPaper({
  topicId,
  brief,
  editedAt,
}: {
  topicId: Id<"topics">;
  brief: string | undefined;
  editedAt: number | undefined;
}) {
  const writeBrief = useAction(api.research.brief);
  const editBrief = useMutation(api.topics.editBrief);
  const [mode, setMode] = useState<Mode>("read");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<null | "writing" | "saving">(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(force: boolean) {
    setBusy("writing");
    setError(null);
    try {
      await writeBrief({ topicId, force });
      setMode("read");
    } catch (err) {
      
      if (refusalCode(err) === "BRIEF_EDITED") {
        setMode("confirm");
      } else {
        setMode("read");
        setError(refusalText(err, "Could not write the brief. Try again."));
      }
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("saving");
    setError(null);
    try {
      await editBrief({ id: topicId, brief: draft });
      setMode("read");
    } catch (err) {
      setError(refusalText(err, "Could not save the brief. Try again."));
    } finally {
      setBusy(null);
    }
  }

  function startEdit() {
    setDraft(brief ?? "");
    setError(null);
    setMode("edit");
  }

  const hasBrief = Boolean(brief);
  return (
    <div className="rs-brief">
      <span className="rs-hole rs-hole-1" aria-hidden="true" />
      <span className="rs-hole rs-hole-2" aria-hidden="true" />
      <span className="rs-hole rs-hole-3" aria-hidden="true" />
      <span className="rs-tape rs-tape-coral" aria-hidden="true" />
      <span className="t-meta rs-brief-label">BRIEF · SUMMARISED FROM YOUR SOURCES</span>

      {mode === "edit" ? (
        <FormField label="Brief">
          <textarea
            className="rs-brief-edit"
            value={draft}
            maxLength={3000}
            onChange={(e) => setDraft(e.target.value)}
          />
        </FormField>
      ) : hasBrief ? (
        <div className="rs-brief-text">
          {briefParagraphs(brief ?? "").map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : (
        <p className="rs-brief-hint">
          No brief yet. Write one from your sources, or type your own.
        </p>
      )}

      {mode === "confirm" && (
        <div className="rs-confirm" role="alert">
          <span>You edited this brief. Regenerating will replace your edits.</span>
          <div className="rs-confirm-actions">
            <button
              type="button"
              className="sq-btn sq-btn-sm sq-btn-dark"
              disabled={busy !== null}
              onClick={() => void generate(true)}
            >
              Replace my edits
            </button>
            <button type="button" className="sq-btn sq-btn-sm" onClick={() => setMode("read")}>
              Keep mine
            </button>
          </div>
        </div>
      )}

      <p className="rs-status" aria-live="polite" data-bad={error ? true : undefined}>
        {busy === "writing" ? "Writing the brief…" : (error ?? "")}
      </p>

      <div className="rs-brief-foot">
        {mode === "edit" ? (
          <>
            <span className="t-meta rs-brief-count">{wordCount(draft)} WORDS</span>
            <button type="button" className="sq-btn sq-btn-sm" onClick={() => setMode("read")}>
              Cancel
            </button>
            <button
              type="button"
              className="sq-btn sq-btn-sm sq-btn-dark"
              disabled={busy !== null}
              onClick={() => void save()}
            >
              {busy === "saving" ? "Saving…" : "Save brief"}
            </button>
          </>
        ) : (
          <>
            <span className="t-meta rs-brief-count">
              {hasBrief
                ? `${wordCount(brief ?? "")} WORDS · ${editedAt ? "EDITED BY YOU" : "EDITABLE"}`
                : "NOT WRITTEN"}
            </span>
            <button type="button" className="sq-btn sq-btn-sm" onClick={startEdit}>
              {hasBrief ? "Edit" : "Write it myself"}
            </button>
            <button
              type="button"
              className="sq-btn sq-btn-sm sq-btn-dark"
              disabled={busy !== null || mode === "confirm"}
              onClick={() => void generate(false)}
            >
              {hasBrief ? "Regenerate" : "Write brief"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
