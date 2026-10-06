"use client";

import Link from "next/link";
import { useEffect, useRef, type MouseEvent } from "react";
import { cancelStatus } from "@/lib/queueA11y";
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

  // A button disables itself while its action runs, which drops keyboard focus on the page. Remember
  // which one was pressed and hand focus back when the action ends (if the sheet is still open).
  const pressed = useRef<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (actions.busy !== null) return;
    const back = pressed.current;
    pressed.current = null;
    if (!back?.isConnected || (back as HTMLButtonElement).disabled) return;
    const active = document.activeElement;
    const dialog = root.current?.closest("dialog");
    // Only take focus back when it was dropped (or left the sheet); never pull it off a control the founder moved to.
    const lost = !active || active === document.body || (dialog ? !dialog.contains(active) : false);
    if (lost) back.focus();
  }, [actions.busy]);
  function press(e: MouseEvent<HTMLElement>, run: () => unknown) {
    pressed.current = e.currentTarget;
    void run();
  }

  const mediaLink = hasMedia ? (
    <Link href="/library/media" className={`sq-btn ${status === "scheduled" ? "sq-btn-dark" : ""}`}>
      Replace media
    </Link>
  ) : null;
  return (
    <div className="sq-q-d-actions" ref={root}>
      {status === "failed" && (
        <div className="sq-q-d-row">
          <button type="button" className="sq-btn sq-btn-dark" disabled={working} onClick={(e) => press(e, actions.retry)}>
            {actions.busy === "retry" ? "Retrying…" : "Retry now"}
          </button>
          <button type="button" className="sq-btn" disabled={working} onClick={(e) => press(e, actions.reschedule)}>
            {actions.busy === "reschedule" ? "Moving…" : "Reschedule"}
          </button>
        </div>
      )}
      {status === "scheduled" && (
        <div className="sq-q-d-row">
          {mediaLink}
          <button type="button" className="sq-btn" disabled={working} onClick={(e) => press(e, actions.reschedule)}>
            {actions.busy === "reschedule" ? "Moving…" : "Reschedule"}
          </button>
        </div>
      )}
      {status === "failed" && mediaLink && <div className="sq-q-d-row">{mediaLink}</div>}
      {status === "published" && (
        <div className="sq-q-d-row">
          <button type="button" className="sq-btn sq-btn-dark" disabled={working} onClick={(e) => press(e, actions.requeue)}>
            {actions.busy === "requeue" ? "Requeuing…" : "Requeue"}
          </button>
        </div>
      )}
      {status === "claimed" && <p className="sq-muted">The publisher has this post right now. Nothing to do.</p>}
      {(status === "scheduled" || status === "failed") && (
        <>
          <button
            type="button"
            className={`sq-btn sq-q-d-cancel${actions.armed ? " sq-q-d-cancel-armed" : ""}`}
            disabled={actions.busy === "cancel"}
            onClick={(e) => press(e, actions.cancel)}
          >
            {actions.armed ? (
              <>
                <span className="sq-q-cancel-long">Tap again to cancel · the draft is kept</span>
                <span className="sq-q-cancel-short">Tap again · the draft is kept</span>
              </>
            ) : (
              "Cancel post"
            )}
          </button>
          {/* A standing live region: the armed state is spoken even though the button keeps focus. */}
          <span className="sq-sr" role="status">
            {cancelStatus(actions.armed)}
          </span>
        </>
      )}
    </div>
  );
}
