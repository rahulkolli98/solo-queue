"use client";

import { useState } from "react";
import { isVideoMime } from "@/lib/libraryBoard";
import type { MediaAsset } from "./types";

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  );
}

/**
 * The picture or first video frame of a media file. A video shows a play
 * badge. When the file cannot be loaded (or is known not to be a media file)
 * a hatched "Can't load preview" state shows instead of a blank box.
 */
export default function MediaThumb({
  asset,
  name = "this file",
  size = "tile",
  broken = false,
}: {
  asset: Pick<MediaAsset, "publicUrl" | "mimeType">;
  /** What the file is called, for the alt text and label. */
  name?: string;
  size?: "tile" | "small";
  /** Skip loading: the file is already known not to be an image or video. */
  broken?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = broken || failedUrl === asset.publicUrl;
  if (failed) {
    return (
      <span className="mthumb mthumb-failed" data-size={size} role="img" aria-label={`Can't load preview of ${name}`}>
        <span>Can&apos;t load preview</span>
      </span>
    );
  }
  if (isVideoMime(asset.mimeType)) {
    return (
      <span className="mthumb" data-size={size} data-video>
        <video
          src={`${asset.publicUrl}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          aria-label={`Video preview of ${name}`}
          onError={() => setFailedUrl(asset.publicUrl)}
        />
        <span className="mthumb-play">
          <PlayIcon />
        </span>
      </span>
    );
  }
  return (
    <span className="mthumb" data-size={size}>
      {/* eslint-disable-next-line @next/next/no-img-element -- user media at arbitrary public URLs */}
      <img
        src={asset.publicUrl}
        alt={`Preview of ${name}`}
        loading="lazy"
        onError={() => setFailedUrl(asset.publicUrl)}
      />
    </span>
  );
}
