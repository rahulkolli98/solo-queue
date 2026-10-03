import { AlertIcon } from "@/components/ui/icons";

/** Board 07e: the card that replaces a draft the model could not write. */
export default function GenerationErrorCard({
  title,
  message,
  onRetry,
  onWriteMyself,
  busy,
}: {
  title: string;
  message: string;
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
      <p>{message} The topic and your other drafts are saved.</p>
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
