import { AlertIcon } from "@/components/ui/icons";
import { generationNextStep } from "@/lib/studioErrors";

/**
 * Board 07e: the card that replaces a draft the model could not write. The
 * message is the backend's own wording, shown whole; under it comes what to
 * do next (Retry, or write the draft yourself).
 */
export default function GenerationErrorCard({
  title,
  message,
  code,
  onRetry,
  onWriteMyself,
  busy,
}: {
  title: string;
  message: string;
  /** Refusal code (LLM_PRIVACY ...), when the error carried one. */
  code?: string | null;
  onRetry: () => void;
  onWriteMyself: () => void;
  busy?: boolean;
}) {
  return (
    <div className="studio-errcard" role="alert">
      <div className="studio-errcard-head">
        <AlertIcon />
        <b>{title}</b>
      </div>
      <p className="studio-errcard-reason">{message}</p>
      <p className="studio-errcard-next">
        {generationNextStep(code)} The topic and your other drafts are saved.
      </p>
      <div className="studio-actions-row">
        <button type="button" className="sq-btn sq-btn-sm sq-btn-dark" onClick={onRetry} disabled={busy}>
          {busy ? "Retrying…" : "Retry"}
        </button>
        <button type="button" className="sq-btn sq-btn-sm" onClick={onWriteMyself}>
          Write it myself
        </button>
      </div>
    </div>
  );
}
