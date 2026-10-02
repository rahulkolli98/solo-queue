"use client";

import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { refusalText } from "@/lib/refusalText";
import { detectCapture } from "@/lib/researchBoard";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

/**
 * "Paste a link, a quote, or a half-thought…": every save starts a topic
 * (sources.add with no topic). A link, a quoted line or a plain thought is
 * told apart here, so the founder only pastes.
 */
export default function CaptureBar({
  lit,
  onSaved,
}: {
  /** Empty inbox: the bar is focused and the save button is the main action. */
  lit: boolean;
  onSaved: (topicId: Id<"topics">) => void;
}) {
  const add = useMutation(api.sources.add);
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lit) input.current?.focus();
  }, [lit]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const capture = detectCapture(value);
    if (!capture) {
      setError("Paste a link, a quote or a thought first.");
      input.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await add({
        kind: capture.kind,
        url: capture.url,
        text: capture.text,
      });
      setValue("");
      onSaved(res.topicId);
      toast({
        title: "Saved to inbox",
        detail:
          capture.kind === "link"
            ? "Link saved as a source on a new topic."
            : "Saved as a new topic with your note.",
      });
    } catch (err) {
      
      setError(refusalText(err, "Could not save that. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="rs-capture" onSubmit={submit} noValidate>
      <div className="rs-capture-row">
        <label htmlFor="rs-capture" className="sq-sr">
          Capture a link, quote or thought
        </label>
        <input
          id="rs-capture"
          ref={input}
          type="text"
          className="rs-capture-input"
          data-lit={lit || undefined}
          placeholder="Paste a link, a quote, or a half-thought…"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "rs-capture-error" : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
        />
        <button
          type="submit"
          className={`sq-btn ${lit ? "sq-btn-primary" : "sq-btn-dark"}`}
          disabled={busy}
        >
          {busy ? "Saving…" : (<><span className="rs-long">Save to inbox</span><span className="rs-short">Save</span></>)}
        </button>
      </div>
      {error && (
        <span id="rs-capture-error" className="rs-capture-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
