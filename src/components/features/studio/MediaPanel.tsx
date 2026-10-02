"use client";

import MediaThumb from "@/components/features/studio/MediaThumb";
import type { MediaActions } from "@/components/features/studio/useMediaActions";
import type { Asset, DraftKind, MediaState } from "@/lib/studioModel";

const NEED: Record<"caption" | "reel", string> = {
  reel: "A reel needs a video before it can be queued.",
  caption: "A caption post needs a photo or video before it can be queued.",
};

function verifiedOn(ts: number | undefined): string {
  if (!ts) return "";
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
}

/**
 * Board 07e's yellow "MEDIA REQUIRED" card, and the attached-media row once
 * something is attached: thumbnail, VERIFIED / UNVERIFIED / STALE pill, and
 * the matching action (Verify, Change, Detach).
 */
export default function MediaPanel({
  kind,
  draftId,
  asset,
  state,
  media,
  onAttach,
}: {
  kind: Extract<DraftKind, "caption" | "reel">;
  draftId: string;
  asset: Asset | undefined;
  state: MediaState;
  media: MediaActions;
  onAttach: () => void;
}) {
  if (state === "none") {
    return (
      <div className="studio-media studio-media-need">
        <div className="studio-media-head">
          <b>{kind === "reel" ? "Reel script" : "Caption"}</b>
          <span className="studio-flag">MEDIA REQUIRED</span>
        </div>
        <p>{NEED[kind]}</p>
        <button type="button" className="sq-btn sq-btn-sm sq-btn-dark" onClick={onAttach}>
          Attach media
        </button>
      </div>
    );
  }
  if (state === "missing" || !asset) {
    return (
      <div className="studio-media studio-media-bad" role="alert">
        <div className="studio-media-head">
          <b>Attached media is gone</b>
          <span className="sq-pill sq-pill-bad">MEDIA MISSING</span>
        </div>
        <p>The file was deleted from the library. Pick another to queue this draft.</p>
        <div className="studio-actions-row">
          <button type="button" className="sq-btn sq-btn-sm sq-btn-dark" onClick={onAttach}>
            Pick media
          </button>
          <button
            type="button"
            className="sq-btn sq-btn-sm"
            disabled={media.busy === draftId}
            onClick={() => void media.attach(draftId, null)}
          >
            Detach
          </button>
        </div>
      </div>
    );
  }
  const pill =
    state === "ok" ? (
      <span className="sq-pill sq-pill-ok">VERIFIED · {verifiedOn(asset.verifiedAt)}</span>
    ) : state === "stale" ? (
      <span className="sq-pill sq-pill-bad">STALE · RE-VERIFY</span>
    ) : (
      <span className="sq-pill sq-pill-bad">UNVERIFIED</span>
    );
  return (
    <div className="studio-media studio-media-ok">
      <MediaThumb asset={asset} />
      <div className="studio-media-body">
        <div className="studio-media-head">
          <b>{asset.filename ?? (asset.mimeType.startsWith("video/") ? "Video" : "Image")}</b>
          {pill}
        </div>
        {asset.lastVerifyError && state !== "ok" && <p>Last check: {asset.lastVerifyError}</p>}
        {media.error && (
          <p className="studio-inline-error" role="alert">
            {media.error}
          </p>
        )}
        <div className="studio-actions-row">
          {state !== "ok" && (
            <button
              type="button"
              className="sq-btn sq-btn-sm sq-btn-dark"
              disabled={media.busy === asset._id}
              onClick={() => void media.verify(asset._id)}
            >
              {media.busy === asset._id ? "Verifying…" : "Verify"}
            </button>
          )}
          <button type="button" className="sq-btn sq-btn-sm" onClick={onAttach}>
            Change
          </button>
          <button
            type="button"
            className="sq-btn sq-btn-sm"
            disabled={media.busy === draftId}
            onClick={() => void media.attach(draftId, null)}
          >
            Detach
          </button>
        </div>
      </div>
    </div>
  );
}
