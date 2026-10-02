"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import FormField from "@/components/ui/FormField";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { checkUploadFile } from "@/lib/libraryBoard";
import { UploadCancelled } from "@/lib/mediaUpload";
import { refusalText } from "@/lib/refusalText";
import { useMediaUpload } from "@/lib/useMediaUpload";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type Kind = "link" | "quote" | "note" | "screenshot";

const KINDS = [
  { value: "link" as const, label: "Link" },
  { value: "quote" as const, label: "Quote" },
  { value: "note" as const, label: "Note" },
  { value: "screenshot" as const, label: "Screenshot" },
];

/**
 * "+ Add a source": a link, a quote, a note of your own or a screenshot,
 * attached to the open topic (sources.add).
 */
export default function AddSource({ topicId }: { topicId: Id<"topics"> }) {
  const add = useMutation(api.sources.add);
  const upload = useMediaUpload();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("link");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setUrl("");
    setText("");
    setLabel("");
    setFile(null);
    setError(null);
    setProgress(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let mediaAssetId: Id<"mediaAssets"> | undefined;
      if (kind === "screenshot") {
        if (!file) {
          setError("Choose the screenshot first.");
          return;
        }
        const problem = checkUploadFile(file);
        if (problem) {
          setError(problem);
          return;
        }
        mediaAssetId = await upload(file, setProgress).done;
      }
      await add({
        topicId,
        kind,
        url: kind === "link" ? url : undefined,
        text: kind === "quote" || kind === "note" ? text : undefined,
        label: label || undefined,
        mediaAssetId,
      });
      toast({ title: "Source added" });
      close();
    } catch (err) {
      if (!(err instanceof UploadCancelled)) {
        setError(refusalText(err, "Could not add that source. Try again."));
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (!open) {
    return (
      <button type="button" className="rs-add-btn" onClick={() => setOpen(true)}>
        + Add a source
      </button>
    );
  }

  return (
    <form className="rs-add" onSubmit={submit} aria-label="Add a source" noValidate>
      <SegmentedControl label="Kind of source" options={KINDS} value={kind} onChange={setKind} />
      {kind === "link" && (
        <FormField label="Link" error={error}>
          <input
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </FormField>
      )}
      {(kind === "quote" || kind === "note") && (
        <FormField label={kind === "quote" ? "Quote" : "Your note"} error={error}>
          <textarea rows={3} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
        </FormField>
      )}
      {kind === "screenshot" && (
        <FormField label="Screenshot" hint="An image up to 50 MB." error={error}>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </FormField>
      )}
      {kind !== "link" && (
        <FormField label={kind === "quote" ? "Where is it from? (optional)" : "Label (optional)"}>
          <input type="text" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        </FormField>
      )}
      <div className="rs-add-actions">
        <button type="submit" className="sq-btn sq-btn-sm sq-btn-dark" disabled={busy}>
          {busy ? (progress !== null ? `Uploading ${progress}%` : "Adding…") : "Add source"}
        </button>
        <button type="button" className="sq-btn sq-btn-sm" onClick={close}>
          Cancel
        </button>
      </div>
    </form>
  );
}
