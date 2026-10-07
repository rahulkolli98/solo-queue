"use client";

import { useState } from "react";
import FormField from "@/components/ui/FormField";
import type { SlotStatus } from "@/lib/queueBoard";
import { AlertIcon } from "@/components/ui/icons";
import { AtRiskNote } from "./AtRiskMark";
import ReceiptsTable, { type Receipt } from "./ReceiptsTable";
import { StatusIcon } from "./StatusChip";
import type { useSlotActions } from "./useSlotActions";

const PILL: Record<SlotStatus, { cls: string; label: string }> = {
  scheduled: { cls: "sq-pill-ok", label: "SCHEDULED" },
  claimed: { cls: "sq-pill-mid", label: "CLAIMED" },
  published: { cls: "sq-pill-mid", label: "PUBLISHED" },
  failed: { cls: "sq-pill-bad", label: "FAILED" },
};

/** The part of `queueBoard.detail` the drawer reads. */
export interface SlotDetail {
  slot: {
    _id: string;
    status: SlotStatus;
    platform: "threads" | "instagram";
    scheduledAt: number;
    attempts: number;
    lastError?: string;
  };
  draft: { body: string; format: string | null; slideCount?: number | null; constraintOk: boolean } | null;
  topic: { title: string } | null;
  media: { publicUrl: string; mimeType: string; verifiedAt: number | null; lastVerifyError: string | null } | null;
  /** A carousel: every slide image, in order. */
  slideMedia?: { _id: string; publicUrl: string; fileRemoved: boolean }[];
  receipts: Receipt[];
  atRisk?: string | null;
}

function MediaPreview({ media, failed }: { media: NonNullable<SlotDetail["media"]>; failed: boolean }) {
  const [broken, setBroken] = useState(false);
  const bad = broken || Boolean(media.lastVerifyError);
  const video = media.mimeType.startsWith("video/");
  return (
    <figure className={`sq-q-media${bad && failed ? " sq-q-media-bad" : ""}`}>
      {broken ? (
        <div className="sq-q-media-gone t-mono">NOT REACHABLE</div>
      ) : video ? (
        <video src={media.publicUrl} controls preload="metadata" onError={() => setBroken(true)} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- founder-hosted media URL, not a build-time asset
        <img src={media.publicUrl} alt="Attached media" onError={() => setBroken(true)} />
      )}
      {media.lastVerifyError && <figcaption className="sq-muted">{media.lastVerifyError}</figcaption>}
    </figure>
  );
}

/** A carousel's slide images in order, small, so the founder sees what will post. */
function SlideStrip({ slides }: { slides: NonNullable<SlotDetail["slideMedia"]> }) {
  return (
    <ol className="sq-q-slides" aria-label={`Carousel slides, ${slides.length}`}>
      {slides.map((s, i) => (
        <li key={s._id}>
          {s.fileRemoved ? (
            <span className="sq-q-slide-gone t-mono">GONE</span>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- founder-hosted slide image, not a build-time asset
            <img src={s.publicUrl} alt={`Slide ${i + 1} of ${slides.length}`} loading="lazy" />
          )}
        </li>
      ))}
    </ol>
  );
}

/** Post text, media, status and receipts, then the reschedule field when the status allows it. */
export default function SlotDetailBody({
  detail,
  tz,
  actions,
}: {
  detail: SlotDetail;
  tz: string;
  actions: ReturnType<typeof useSlotActions>;
}) {
  const { slot, draft, media, receipts } = detail;
  const slides = detail.slideMedia ?? [];
  const parts = (draft?.body ?? "")
    .split(/^\s*---\s*$/m)
    .map((p) => p.trim())
    .filter(Boolean);
  const canMove = slot.status === "scheduled" || slot.status === "failed";
  return (
    <>
      <div className="sq-q-d-status">
        <span className={`sq-pill ${PILL[slot.status].cls}`}>
          <StatusIcon status={slot.status} />
          {PILL[slot.status].label}
        </span>
        <span className="t-mono sq-muted">
          {slot.attempts} attempt{slot.attempts === 1 ? "" : "s"}
        </span>
        {draft && !draft.constraintOk && (
          <span className="sq-pill sq-pill-bad">
            <span className="sq-q-statusicon" aria-hidden="true">
              <AlertIcon />
            </span>
            OVER LIMIT
          </span>
        )}
      </div>
      <AtRiskNote reason={detail.atRisk} />
      {slot.status === "failed" && slot.lastError && (
        <div className="sq-error-box" role="alert">
          {slot.lastError}
        </div>
      )}
      {slides.length > 1 ? (
        <SlideStrip slides={slides} />
      ) : (
        media && <MediaPreview media={media} failed={slot.status === "failed"} />
      )}
      <div className="sq-q-d-text">
        {parts.length === 0 && <p className="sq-muted">The draft behind this post is empty.</p>}
        {parts.map((part, i) =>
          // Instagram drafts are one caption plus a counts footer after "---"; only Threads has numbered posts.
          slot.platform === "instagram" && i > 0 ? (
            <span key={i} className="t-meta sq-muted">
              {part}
            </span>
          ) : (
            <div key={i} className="sq-q-d-part">
              {slot.platform === "threads" && parts.length > 1 && <span className="t-tag-sm sq-muted">POST {i + 1}</span>}
              <p>{part}</p>
            </div>
          )
        )}
      </div>
      <ReceiptsTable receipts={receipts} tz={tz} />
      {canMove && (
        <FormField label="Reschedule to" hint={`Your time zone: ${tz}.`}>
          <input type="datetime-local" value={actions.when} onChange={(e) => actions.setWhen(e.target.value)} />
        </FormField>
      )}
      {actions.error && (
        <div className="sq-error-box" role="alert">
          {actions.error}
        </div>
      )}
    </>
  );
}
