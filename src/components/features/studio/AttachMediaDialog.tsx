"use client";

import Link from "next/link";
import Drawer from "@/components/ui/Drawer";
import MediaThumb from "@/components/features/studio/MediaThumb";
import type { MediaActions } from "@/components/features/studio/useMediaActions";
import { mediaState, type Asset } from "@/lib/studioModel";

function when(ts: number | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
}

/**
 * Studio's media picker: the library's assets as tiles with Use / Verify.
 * (Uploading and URL registration live in Library > Media.)
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
        <Link href="/library" className="sq-btn">
          Upload in Library
        </Link>
      }
    >
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
        <p className="sq-muted">The library is empty. Upload a photo or video in Library, then come back.</p>
      ) : (
        <ul className="studio-picker">
          {assets.map((asset) => {
            const state = mediaState(asset._id, asset, now);
            const current = asset._id === currentAssetId;
            return (
              <li key={asset._id} className="studio-pick" data-current={current || undefined}>
                <MediaThumb asset={asset} />
                <div className="studio-pick-body">
                  <b>{asset.filename ?? (asset.mimeType.startsWith("video/") ? "Video" : "Image")}</b>
                  <span className="t-meta">
                    {asset.mimeType.startsWith("video/") ? "VIDEO" : "IMAGE"} · {when(asset.createdAt)}
                  </span>
                  {state === "ok" ? (
                    <span className="sq-pill sq-pill-ok">VERIFIED · {when(asset.verifiedAt)}</span>
                  ) : (
                    <span className="sq-pill sq-pill-bad">{state === "stale" ? "STALE" : "UNVERIFIED"}</span>
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
                    {state !== "ok" && (
                      <button
                        type="button"
                        className="sq-btn sq-btn-sm"
                        disabled={media.busy === asset._id}
                        onClick={() => void media.verify(asset._id)}
                      >
                        {media.busy === asset._id ? "Verifying…" : "Verify"}
                      </button>
                    )}
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
