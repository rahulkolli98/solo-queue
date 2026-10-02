"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import FormField from "@/components/ui/FormField";
import { studioErrorText } from "@/lib/studioErrors";

/** Paste a link or a quote under this topic (sources.add). */
export default function AddSourceForm({ topicId, onDone }: { topicId: string; onDone: () => void }) {
  const add = useMutation(api.sources.add);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) {
      setError("Paste a link or a quote.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const isLink = /^https?:\/\//i.test(value);
      await add({
        topicId: topicId as Id<"topics">,
        kind: isLink ? "link" : "quote",
        url: isLink ? value : undefined,
        text: isLink ? undefined : value,
      });
      setText("");
      onDone();
    } catch (err) {
      setError(studioErrorText(err, "Couldn't add that source."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="studio-addsource" onSubmit={(e) => void submit(e)} aria-label="Add a source">
      <FormField label="Link or quote" error={error}>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="https://… or a line worth keeping" />
      </FormField>
      <div className="studio-actions-row">
        <button type="submit" className="sq-btn sq-btn-sm sq-btn-dark" disabled={busy}>
          {busy ? "Adding…" : "Add source"}
        </button>
        <button type="button" className="sq-btn sq-btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
