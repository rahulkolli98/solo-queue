"use client";

import Link from "next/link";
import Drawer from "@/components/ui/Drawer";
import MediaThumb from "@/components/features/studio/MediaThumb";
import UploadAndAttach from "@/components/features/studio/UploadAndAttach";
import type { MediaActions } from "@/components/features/studio/useMediaActions";
import { describeMediaStatus, mediaHost, mediaTypeLabel, type MediaStatusKind } from "@/lib/mediaStatus";
import { mediaState, type Asset } from "@/lib/studioModel";

/** The Studio's own state (none/missing aside) mapped onto the plain-language kinds. */
const KIND_BY_STATE: Record<"ok" | "stale" | "unverified", MediaStatusKind> = {
  ok: "ready",
  stale: "recheck",
  unverified: "unchecked",
};

/**
 * Studio's media picker: upload a new photo or video right here (it is checked and
 * attached in one go), or pick one already in the library with Use / Verify.
 * Registering a link and managing every file live in Library > Media.
 */
export default function AttachMediaDialog({
  open,
  onClose,
  assets,
  draftId,
  currentAssetId,
  forLabel,
  now,
  media,
}: {
  open: boolean;
  onClose: () => void;
  assets: (Asset & { createdAt: number })[] | undefined;
  /** The draft the media goes to; null when none is open. */
  draftId: string | null;
  currentAssetId: string | undefined;
  forLabel: string;
  now: number;
  media: MediaActions;
}) {
  async function use(assetId: string) {
    if (!draftId) return;
    if (await media.attach(draftId, assetId)) onClose();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Attach media"
      eyebrow={`Instagram · ${forLabel}`}
      footer={
        <Link href="/library/media" className="sq-btn">
          Manage all files in Library
        </Link>
      }
    >
      <UploadAndAttach draftId={draftId} media={media} onAttached={onClose} />
      {media.error && (
        <p className="studio-inline-error" role="alert">
          {media.error}
        </p>
      )}
      {assets === undefined ? (
        <p className="sq-muted" role="status">
          Loading the library…
        </p>
      ) : assets.length === 0 ? (
        <p className="sq-muted">Nothing in the library yet. Upload a photo or video above.</p>
      ) : (
        <ul className="studio-picker">
          {assets.map((asset) => {
            const state = mediaState(asset._id, asset, now);
            const current = asset._id === currentAssetId;
            const kind: MediaStatusKind =
              state === "ok" || state === "stale" ? KIND_BY_STATE[state] : asset.lastVerifyError ? "not_media" : "unchecked";
            const status = describeMediaStatus(kind, asset, now);
            const name = asset.filename ?? (asset.mimeType.startsWith("video/") ? "Video" : "Image");
            return (
              <li key={asset._id} className="studio-pick" data-current={current || undefined}>
                <MediaThumb asset={asset} name={name} broken={kind === "not_media"} />
                <div className="studio-pick-body">
                  <b>{name}</b>
                  <span className="t-meta">
                    {mediaTypeLabel(asset.mimeType)} · {mediaHost(asset)}
                  </span>
                  <span className={`sq-pill sq-pill-${status.tone}`}>{status.label}</span>
                  {status.checked && <span className="t-meta">{status.checked}</span>}
                  {status.reason && (
                    <p className="studio-reason">
                      {status.reason} <b>{status.next}</b>
                    </p>
                  )}
                  <div className="studio-actions-row">
                    <button
                      type="button"
                      className="sq-btn sq-btn-sm sq-btn-dark"
                      disabled={!draftId || media.busy === draftId || current}
                      onClick={() => void use(asset._id)}
                    >
                      {current ? "In use" : "Use"}
                    </button>
                    {kind !== "ready" && (
                      <button
                        type="button"
                        className="sq-btn sq-btn-sm"
                        disabled={media.busy === asset._id}
                        onClick={() => void media.verify(asset._id)}
                      >
                        {media.busy === asset._id ? "Checking…" : kind === "unchecked" ? "Check" : "Recheck"}
                      </button>
                    )}
                    <a className="studio-open" href={asset.publicUrl} target="_blank" rel="noopener noreferrer">
                      Open file<span className="sq-sr"> (opens in a new tab)</span>
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
