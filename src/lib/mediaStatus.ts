/**
 * What a media asset IS and whether Instagram can use it, in plain words.
 * Shared by Library > Media and the Studio attach dialog / media panel.
 * Pure (no clock reads: callers pass `now`), so it is unit tested.
 */
import { VERIFIED_TTL_MS } from "../../convex/lib/slots";

export type MediaStatusKind = "ready" | "not_media" | "unchecked" | "recheck";

export interface MediaStatus {
  kind: MediaStatusKind;
  /** The pill text. Always words, never colour alone. */
  label: string;
  tone: "ok" | "mid" | "bad";
  /** "checked 3 h ago" (ready and check-again states), else null. */
  checked: string | null;
  /** The full reason a file was refused (not_media), else null. */
  reason: string | null;
  /** What to do next (not_media), else null. */
  next: string | null;
}

export interface MediaLike {
  mimeType: string;
  publicUrl: string;
  verifiedAt?: number;
  lastVerifyError?: string;
  filename?: string;
  source?: "upload" | "external";
}

export const UPLOAD_INSTEAD = "Upload the file instead.";

/** Hosts whose links are web pages, never a direct file (older checks let some through). */
const PAGE_HOSTS = [
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "drive.google.com",
  "docs.google.com",
  "dropbox.com",
  "instagram.com",
  "tiktok.com",
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isPageHost(url: string): boolean {
  const host = hostOf(url);
  return host !== null && PAGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export function isImageOrVideo(mimeType: string): boolean {
  return mimeType.startsWith("image/") || mimeType.startsWith("video/");
}

/** "IMAGE" or "VIDEO" (anything else is treated as an image by the previews). */
export function mediaTypeLabel(mimeType: string): "IMAGE" | "VIDEO" {
  return mimeType.startsWith("video/") ? "VIDEO" : "IMAGE";
}

/** "Uploaded" for a file in our storage, else the host of the link ("picsum.photos"). */
export function mediaHost(asset: Pick<MediaLike, "publicUrl" | "source">): string {
  if (asset.source === "upload") return "Uploaded";
  return hostOf(asset.publicUrl) ?? "External link";
}

/** "just now", "12 min ago", "3 h ago", "2 d ago". */
export function agoLabel(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export function mediaStatusKind(asset: MediaLike, now: number): MediaStatusKind {
  if (asset.verifiedAt) {
    if (!isImageOrVideo(asset.mimeType) || (asset.source !== "upload" && isPageHost(asset.publicUrl))) {
      return "not_media";
    }
    return now - asset.verifiedAt > VERIFIED_TTL_MS ? "recheck" : "ready";
  }
  return asset.lastVerifyError ? "not_media" : "unchecked";
}

const GENERIC_REASON =
  "That link is a web page, not an image or video file. Instagram needs a direct link to the file itself (ends in .jpg, .png, .mp4 ...).";

/** Describe an asset's state for a given kind (the Studio panel derives the kind from its own state). */
export function describeMediaStatus(kind: MediaStatusKind, asset: MediaLike, now: number): MediaStatus {
  switch (kind) {
    case "ready":
      return {
        kind,
        label: "READY FOR INSTAGRAM",
        tone: "ok",
        checked: asset.verifiedAt ? `checked ${agoLabel(asset.verifiedAt, now)}` : null,
        reason: null,
        next: null,
      };
    case "recheck":
      return {
        kind,
        label: "CHECK AGAIN SOON",
        tone: "mid",
        checked: asset.verifiedAt ? `checked ${agoLabel(asset.verifiedAt, now)}` : null,
        reason: null,
        next: null,
      };
    case "not_media":
      return {
        kind,
        label: "NOT A MEDIA FILE",
        tone: "bad",
        checked: null,
        reason: asset.lastVerifyError?.trim() || GENERIC_REASON,
        next: UPLOAD_INSTEAD,
      };
    default:
      return { kind: "unchecked", label: "NOT CHECKED YET", tone: "mid", checked: null, reason: null, next: null };
  }
}

/** Map an asset to its plain-language state. */
export function mediaStatus(asset: MediaLike, now: number): MediaStatus {
  return describeMediaStatus(mediaStatusKind(asset, now), asset, now);
}
