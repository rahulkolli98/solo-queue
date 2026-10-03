"use client";

import { useState } from "react";
import { isVideoMime } from "@/lib/libraryBoard";
import type { MediaAsset } from "./types";

/** The picture or first video frame of a library file; a hatch shows when it cannot be loaded. */
export default function MediaThumb({ asset }: { asset: Pick<MediaAsset, "publicUrl" | "mimeType"> }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  if (isVideoMime(asset.mimeType)) {
    return <video src={`${asset.publicUrl}#t=0.1`} muted playsInline preload="metadata" onError={() => setFailed(true)} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={asset.publicUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
  );
}
