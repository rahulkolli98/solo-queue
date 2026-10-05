"use client";

import { useId, useRef, useState } from "react";
import type { MediaActions } from "@/components/features/studio/useMediaActions";
import { UploadIcon } from "@/components/ui/icons";
import { checkUploadFile } from "@/lib/libraryBoard";
import { UploadCancelled } from "@/lib/mediaUpload";
import { studioErrorText } from "@/lib/studioErrors";
import { stoppedMessage, uploadStatusText, uploadVerifyAttach, type UploadStage } from "@/lib/studioUpload";
import { useMediaUpload } from "@/lib/useMediaUpload";

/**
 * Upload a photo or video right here, in the attach dialog: it is stored in the
 * library, checked, and put on the draft in one go. (Before, the Studio could
 * only pick files that were already in the library.)
 */
export default function UploadAndAttach({
  draftId,
  media,
  onAttached,
}: {
  /** The draft the file goes to; null when none is open. */
  draftId: string | null;
  media: MediaActions;
  onAttached: () => void;
}) {
  const startUpload = useMediaUpload();
  const inputId = useId();
  const picker = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [stage, setStage] = useState<{ stage: UploadStage; percent?: number } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const working = stage !== null;
  const disabled = !draftId || working;

  async function handle(file: File | undefined) {
    if (!file || !draftId) return;
    setNote(null);
    media.clearError();
    try {
      const outcome = await uploadVerifyAttach({
        file,
        draftId,
        check: checkUploadFile,
        upload: (onProgress) => startUpload(file, onProgress).done,
        verify: media.verify,
        attach: media.attach,
        onStage: (s, percent) => setStage({ stage: s, percent }),
      });
      if (outcome.kind === "attached") onAttached();
      else if (outcome.kind === "refused") setNote(outcome.message);
      else setNote(stoppedMessage(outcome.step));
    } catch (e) {
      if (!(e instanceof UploadCancelled)) setNote(studioErrorText(e, "Upload failed. Try again."));
    } finally {
      setStage(null);
    }
  }

  return (
    <div
      className="studio-upload"
      data-over={over || undefined}
      data-busy={working || undefined}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) void handle(e.dataTransfer.files[0]);
      }}
    >
      <UploadIcon />
      <div className="studio-upload-text">
        <b>{working ? uploadStatusText(stage.stage, stage.percent) : "Upload a photo or video"}</b>
        <span>
          {draftId
            ? "Drop a file here, or choose one. JPG, PNG or MP4, up to 50 MB. It goes straight onto this draft."
            : "Write or generate this draft first, then upload."}
        </span>
      </div>
      <button type="button" className="sq-btn sq-btn-sm sq-btn-dark" disabled={disabled} onClick={() => picker.current?.click()}>
        {working ? "Working…" : "Choose a file"}
      </button>
      <label htmlFor={inputId} className="sq-sr">
        Choose a photo or video to upload
      </label>
      <input
        id={inputId}
        ref={picker}
        type="file"
        accept="image/*,video/*"
        className="sq-sr"
        tabIndex={-1}
        disabled={disabled}
        onChange={(e) => {
          void handle(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {note && (
        <p className="studio-upload-note" role="alert">
          {note}
        </p>
      )}
    </div>
  );
}
