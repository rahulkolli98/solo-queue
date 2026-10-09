"use client";

import MediaThumb from "@/components/features/studio/MediaThumb";
import type { MediaActions } from "@/components/features/studio/useMediaActions";
import { describeMediaStatus, mediaHost, mediaTypeLabel, type MediaStatusKind } from "@/lib/mediaStatus";
import type { Asset, DraftKind, MediaState } from "@/lib/studioModel";
import { useNow } from "@/lib/useNow";

const NEED: Record<"caption" | "reel", string> = {
  reel: "A reel needs a video before it can be queued.",
  caption: "A caption post needs a photo or video before it can be queued.",
};

/**
 * Board 07e's yellow "MEDIA REQUIRED" card, and the attached-media row once
 * something is attached: preview, name, type and host, a plain-language state
 * pill (READY FOR INSTAGRAM, NOT A MEDIA FILE, NOT CHECKED YET, CHECK AGAIN
 * SOON), and the matching actions (Check, Open file, Change, Detach).
 */
export default function MediaPanel({
  kind,
  draftId,
  asset,
  state,
  media,
  onAttach,
}: {
  /** "threads" is a thread's own photo or video: optional, and posted with its first post only. */
  kind: Extract<DraftKind, "caption" | "reel" | "threads">;
  draftId: string;
  asset: Asset | undefined;
  state: MediaState;
  media: MediaActions;
  onAttach: () => void;
}) {
  const now = useNow();
  const platform = kind === "threads" ? "threads" : "instagram";
  if (state === "none" && kind === "threads") {
    return (
      <div className="studio-media studio-media-opt">
        <div className="studio-media-head">
          <b>Photo or video</b>
          <span className="t-meta">OPTIONAL · FIRST POST ONLY</span>
        </div>
        <button type="button" className="sq-btn sq-btn-sm sq-btn-light" onClick={onAttach}>
          Add media
        </button>
      </div>
    );
  }
  if (state === "none") {
    return (
      <div className="studio-media studio-media-need">
        <div className="studio-media-head">
          <b>{kind === "reel" ? "Reel script" : "Caption"}</b>
          <span className="studio-flag">MEDIA REQUIRED</span>
        </div>
        <p>{NEED[kind === "reel" ? "reel" : "caption"]}</p>
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
        <p>
          {kind === "threads"
            ? "The file was deleted from the library. Pick another, or detach it to post the thread as text."
            : "The file was deleted from the library. Pick another to queue this draft."}
        </p>
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
  const mkind: MediaStatusKind =
    state === "ok" ? "ready" : state === "stale" ? "recheck" : asset.lastVerifyError ? "not_media" : "unchecked";
  const status = describeMediaStatus(mkind, asset, now, platform);
  const name = asset.filename ?? (asset.mimeType.startsWith("video/") ? "Video" : "Image");
  return (
    <div className="studio-media studio-media-ok">
      <MediaThumb asset={asset} name={name} broken={mkind === "not_media"} />
      <div className="studio-media-body">
        <div className="studio-media-head">
          <b>{name}</b>
          <span className={`sq-pill sq-pill-${status.tone}`}>{status.label}</span>
        </div>
        <span className="t-meta">
          {mediaTypeLabel(asset.mimeType)} · {mediaHost(asset)}
          {status.checked ? ` · ${status.checked}` : ""}
        </span>
        {status.reason && (
          <p className="studio-reason">
            {status.reason} <b>{status.next}</b>
          </p>
        )}
        {media.error && (
          <p className="studio-inline-error" role="alert">
            {media.error}
          </p>
        )}
        <div className="studio-actions-row">
          {mkind !== "ready" && (
            <button
              type="button"
              className="sq-btn sq-btn-sm sq-btn-dark"
              disabled={media.busy === asset._id}
              onClick={() => void media.verify(asset._id)}
            >
              {media.busy === asset._id ? "Checking…" : mkind === "unchecked" ? "Check" : "Recheck"}
            </button>
          )}
          <a className="studio-open" href={asset.publicUrl} target="_blank" rel="noopener noreferrer">
            Open file<span className="sq-sr"> (opens in a new tab)</span>
          </a>
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
