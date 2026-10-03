"use client";

import Link from "next/link";
import type { SlotDetail } from "./SlotDetailBody";
import type { useSlotActions } from "./useSlotActions";

/** Footer buttons that fit the slot's status: retry, reschedule, replace media, two-tap cancel, requeue. */
export default function SlotActions({
  detail,
  actions,
}: {
  detail: SlotDetail;
  actions: ReturnType<typeof useSlotActions>;
}) {
  const { status, platform } = detail.slot;
  const working = actions.busy !== null;
  const hasMedia = platform === "instagram" || Boolean(detail.media);
  const mediaLink = hasMedia ? (
    <Link href="/library/media" className={`sq-btn ${status === "scheduled" ? "sq-btn-dark" : ""}`}>
      Replace media
    </Link>
  ) : null;
  return (
    <div className="sq-q-d-actions">
      {status === "failed" && (
        <div className="sq-q-d-row">
          <button type="button" className="sq-btn sq-btn-dark" disabled={working} onClick={actions.retry}>
            {actions.busy === "retry" ? "Retrying…" : "Retry now"}
          </button>
          <button type="button" className="sq-btn" disabled={working} onClick={actions.reschedule}>
            {actions.busy === "reschedule" ? "Moving…" : "Reschedule"}
          </button>
        </div>
      )}
      {status === "scheduled" && (
        <div className="sq-q-d-row">
          {mediaLink}
          <button type="button" className="sq-btn" disabled={working} onClick={actions.reschedule}>
            {actions.busy === "reschedule" ? "Moving…" : "Reschedule"}
          </button>
        </div>
      )}
      {status === "failed" && mediaLink && <div className="sq-q-d-row">{mediaLink}</div>}
      {status === "published" && (
        <div className="sq-q-d-row">
          <button type="button" className="sq-btn sq-btn-dark" disabled={working} onClick={actions.requeue}>
            {actions.busy === "requeue" ? "Requeuing…" : "Requeue"}
          </button>
        </div>
      )}
      {status === "claimed" && <p className="sq-muted">The publisher has this post right now. Nothing to do.</p>}
      {status === "scheduled" && (
        <button
          type="button"
          className={`sq-btn sq-q-d-cancel${actions.armed ? " sq-q-d-cancel-armed" : ""}`}
          disabled={actions.busy === "cancel"}
          onClick={actions.cancel}
          aria-live="polite"
        >
          {actions.armed ? "Tap again to cancel · the draft is kept" : "Cancel post"}
        </button>
      )}
    </div>
  );
}
