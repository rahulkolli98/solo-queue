/**
 * Pure helpers for the Library screen: postcard labels and tilts, draft
 * statuses and filters, story-frame editing, media states. No I/O.
 */

import { numberWord } from "@/lib/researchBoard";
import { STYLE_MAX } from "../../convex/lib/framesModel";

export { STYLE_MAX };

// ---------- time (the founder's zone, 24-hour) ----------

function parts(ts: number, tz: string) {
  const out = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ts);
  const get = (type: string) => out.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    day: get("day"),
    month: get("month"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** "24 SEP" for mono labels. */
export function dayMonth(ts: number, tz: string): string {
  const p = parts(ts, tz);
  return `${p.day} ${p.month}`.toUpperCase();
}

/** "Fri 3 Oct, 09:30" for toasts. */
export function whenLabel(ts: number, tz: string): string {
  const p = parts(ts, tz);
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

/** The zone to show times in: the saved zone, or the browser's while it is still "auto". */
export function effectiveTz(saved: string | undefined, browser: string): string {
  return !saved || saved === "auto" ? browser : saved;
}

// ---------- postcards ----------

const TILTS = [-0.6, 0.8, 0.5, -1, 1, -0.8, -0.5, 0.7];
const SHAPES = ["50%", "24px", "50% 50% 0 0", "50%"];

/** A small, stable tilt in degrees (within the +-1 of the boards) for the nth postcard. */
export function tiltFor(index: number): number {
  return TILTS[index % TILTS.length];
}

/** The border-radius of the blob behind an Instagram postcard. */
export function blobFor(index: number): string {
  return SHAPES[index % SHAPES.length];
}

const FORMAT_WORD: Record<string, string> = {
  thread: "THREAD",
  single: "SINGLE",
  caption: "CAPTION",
  reel: "REEL",
  carousel: "CAROUSEL",
  blog: "BLOG",
};

/** "THREADS · 24 SEP" / "REEL · 23 SEP". */
export function postcardMeta(
  post: { platform: "threads" | "instagram"; format: string | null; publishedAt: number; slideCount?: number | null },
  tz: string
): string {
  const word = post.format ? (FORMAT_WORD[post.format] ?? post.format.toUpperCase()) : null;
  // A thread whose first post carries a carousel says so, with the slide count.
  const threadsLead = post.slideCount ? `THREADS · THREAD · ${post.slideCount} ${post.slideCount === 1 ? "SLIDE" : "SLIDES"}` : "THREADS";
  const lead =
    post.platform === "threads"
      ? threadsLead
      : word
        ? post.format === "carousel" && post.slideCount
          ? `${word} · ${post.slideCount} ${post.slideCount === 1 ? "SLIDE" : "SLIDES"}`
          : word
        : "INSTAGRAM";
  return `${lead} · ${dayMonth(post.publishedAt, tz)}`;
}

/** "REST 12 D" shown when a requeue is not allowed yet. */
export function restLabel(restDaysLeft: number): string {
  return `REST ${restDaysLeft} D`;
}

// ---------- drafts ----------

export type DraftStatusKey = "OVER_LIMIT" | "NEEDS_MEDIA" | "SAVED" | "BLOG";
export type DraftFilter = "all" | "fixing" | "saved";

export interface DraftStatusView {
  label: string;
  /** CSS modifier for the status pill. */
  tone: "bad" | "ink" | "mid";
  /** Label of the matching fix action. */
  action: string;
}

export const DRAFT_STATUS: Record<DraftStatusKey, DraftStatusView> = {
  OVER_LIMIT: { label: "OVER LIMIT", tone: "bad", action: "Trim" },
  NEEDS_MEDIA: { label: "NEEDS MEDIA", tone: "bad", action: "Attach" },
  SAVED: { label: "SAVED", tone: "ink", action: "Queue next" },
  BLOG: { label: "NOT POSTED", tone: "mid", action: "Copy .md" },
};

export function matchesDraftFilter(status: DraftStatusKey, filter: DraftFilter): boolean {
  if (filter === "all") return true;
  if (filter === "fixing") return status === "OVER_LIMIT" || status === "NEEDS_MEDIA";
  return status === "SAVED";
}

/** "THREADS · THREAD", "CAROUSEL", "BLOG" for the top line of a draft card. */
export function draftMeta(platform: "threads" | "instagram" | "blog", format: string | null, slideCount?: number | null): string {
  if (platform === "blog") return "BLOG";
  const base = format ? (FORMAT_WORD[format] ?? format.toUpperCase()) : null;
  // A carousel says how many slides it has: "CAROUSEL · 6 SLIDES"; so does a thread whose first post carries one.
  const word = base && (format === "carousel" || (platform === "threads" && format === "thread")) && slideCount ? `${base} · ${slideCount} ${slideCount === 1 ? "SLIDE" : "SLIDES"}` : base;
  if (platform === "threads") return word ? `THREADS · ${word}` : "THREADS";
  return word ?? "INSTAGRAM";
}

export function matchesSearch(haystack: string[], search: string): boolean {
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return haystack.join(" ").toLowerCase().includes(needle);
}

// ---------- story frames ----------

export type FrameFit = "thread" | "single" | "reel" | "carousel";
export const FRAME_FITS: { value: FrameFit; label: string }[] = [
  { value: "thread", label: "THREAD" },
  { value: "single", label: "SINGLE" },
  { value: "reel", label: "REEL" },
  { value: "carousel", label: "CAROUSEL" },
];

const FIT_LABEL: Record<FrameFit, string> = {
  thread: "THREADS THREAD",
  single: "SINGLE",
  reel: "REEL",
  carousel: "CAROUSEL",
};

/** "FITS · THREADS THREAD · REEL" */
export function fitsLine(fits: FrameFit[]): string {
  return `FITS · ${fits.map((f) => FIT_LABEL[f]).join(" · ")}`;
}

/** Rail line under a frame name: the beats as an arrow chain when short, else a count. */
export function beatsLine(beats: { label: string }[], usedCount: number): string {
  const chain = beats.map((b) => b.label.toUpperCase()).join(" → ");
  const lead = chain.length <= 34 ? chain : `${beats.length} BEATS`;
  return `${lead} · USED ${usedCount}×`;
}

export const MIN_BEATS = 2;
export const MAX_BEATS = 5;

export interface FrameDraft {
  /** null while the frame is new; the key of an existing frame never changes. */
  key: string | null;
  name: string;
  beats: { label: string; hint: string }[];
  fits: FrameFit[];
  color: string;
  /** Carousel look, tone and references; "" when none. Absent on drafts made before the field existed. */
  style?: string;
}

export function emptyFrame(color: string): FrameDraft {
  return {
    key: null,
    name: "",
    beats: [
      { label: "", hint: "" },
      { label: "", hint: "" },
    ],
    fits: ["thread"],
    color,
    style: "",
  };
}

/** A new, unsaved copy of a frame. */
export function duplicateFrame(frame: FrameDraft): FrameDraft {
  return {
    ...frame,
    key: null,
    name: `${frame.name} copy`.slice(0, 60),
    beats: frame.beats.map((b) => ({ ...b })),
    fits: [...frame.fits],
    style: frame.style ?? "",
  };
}

/** True when the frame fits a carousel, the only place the style note is used. */
export function fitsCarousel(fits: FrameFit[]): boolean {
  return fits.includes("carousel");
}

/** "1,204 / 2,000" for the live count under the style field. */
export function styleCount(style: string): string {
  return `${style.length.toLocaleString("en-US")} / ${STYLE_MAX.toLocaleString("en-US")}`;
}

export const STYLE_TOO_LONG = `The style notes can be up to ${STYLE_MAX.toLocaleString("en-US")} characters.`;

/**
 * The style to send with a save: the trimmed note when the frame fits a carousel and it is not blank,
 * otherwise undefined (the backend clears the style when none is sent, so a hidden note never lingers).
 */
export function styleToSave(draft: Pick<FrameDraft, "fits" | "style">): string | undefined {
  if (!fitsCarousel(draft.fits)) return undefined;
  const text = (draft.style ?? "").trim();
  return text ? text : undefined;
}

/** The arguments of `api.frames.save` for a draft; `style` is present only when there is a note to keep. */
export function frameSaveArgs(draft: FrameDraft, key: string) {
  const style = styleToSave(draft);
  return {
    key,
    name: draft.name.trim(),
    beats: draft.beats.map((b) => ({ label: b.label.trim(), hint: b.hint.trim() })),
    fits: draft.fits,
    color: draft.color,
    ...(style !== undefined ? { style } : {}),
  };
}

/** A key like "hook-tension-turn" from a name, unique among `taken`. */
export function keyFromName(name: string, taken: string[]): string {
  let base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36)
    .replace(/-+$/g, "");
  if (!base) base = "frame";
  if (!/^[a-z]/.test(base)) base = `f-${base}`;
  if (base.length < 2) base = `${base}-1`;
  let key = base;
  let n = 2;
  while (taken.includes(key)) {
    key = `${base.slice(0, 36)}-${n}`;
    n += 1;
  }
  return key;
}

/** Moves a beat one place up (-1) or down (+1); returns the same array when it cannot move. */
export function moveBeat<T>(beats: T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= beats.length || index < 0 || index >= beats.length) return beats;
  const next = [...beats];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

export function toggleFit(fits: FrameFit[], fit: FrameFit): FrameFit[] {
  return fits.includes(fit) ? fits.filter((f) => f !== fit) : [...fits, fit];
}

export interface FrameFormErrors {
  name?: string;
  beats?: string;
  fits?: string;
  style?: string;
}

/** Plain-language problems with a frame form, before anything is sent. */
export function frameFormErrors(draft: FrameDraft): FrameFormErrors {
  const errors: FrameFormErrors = {};
  if (!draft.name.trim()) errors.name = "Give the frame a name.";
  if (draft.beats.length < MIN_BEATS || draft.beats.length > MAX_BEATS) {
    errors.beats = `A frame has ${MIN_BEATS} to ${MAX_BEATS} beats.`;
  } else if (draft.beats.some((b) => !b.label.trim())) {
    errors.beats = "Every beat needs a name.";
  }
  if (draft.fits.length === 0) errors.fits = "Choose at least one place it fits.";
  if (fitsCarousel(draft.fits) && (draft.style ?? "").length > STYLE_MAX) errors.style = STYLE_TOO_LONG;
  return errors;
}

export function hasErrors(errors: FrameFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

// ---------- media ----------

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Why a file cannot be uploaded, or null when it can. */
export function checkUploadFile(file: { type: string; size: number; name: string }): string | null {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return `${file.name}: only images and videos can be queued to Instagram.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name}: too big (50 MB max for Instagram-bound media).`;
  }
  return null;
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  mov: "video/quicktime",
  m4v: "video/mp4",
  webm: "video/webm",
};

/** Best guess at a hosted file's type from its URL; images are the default. */
export function mimeFromUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
    return MIME_BY_EXT[ext] ?? "image/jpeg";
  } catch {
    return "image/jpeg";
  }
}

export type MediaState = "verified" | "unverified" | "unreachable";

export function mediaState(asset: { verifiedAt?: number; lastVerifyError?: string }): MediaState {
  if (asset.verifiedAt) return "verified";
  if (asset.lastVerifyError) return "unreachable";
  return "unverified";
}

/** A file name for a tile: the stored name, else the end of the URL. */
export function mediaName(asset: { filename?: string; publicUrl: string }): string {
  if (asset.filename) return asset.filename;
  try {
    const last = new URL(asset.publicUrl).pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : "external link";
  } catch {
    return "external link";
  }
}

export function isVideoMime(mimeType: string): boolean {
  return mimeType.startsWith("video/");
}

// ---------- headline ----------

export type LibraryTab = "published" | "drafts" | "frames" | "media";

export interface LibraryHeadline {
  before: string;
  rust: string;
  after: string;
  aside: string;
}

/** The page statement per tab, with its one rust word. */
export function libraryHeadline(tab: LibraryTab, counts: { drafts?: number; frames?: number }): LibraryHeadline {
  switch (tab) {
    case "published":
      return {
        before: "Everything you wrote,",
        rust: "worth",
        after: " posting twice.",
        aside:
          "Mark what holds up as evergreen. Once its rest period is over, requeue it into the next free slot, with the original kept as history.",
      };
    case "drafts": {
      const n = counts.drafts;
      return {
        before: n === undefined ? "Drafts," : n === 0 ? "No drafts" : `${numberWord(n)} ${n === 1 ? "draft" : "drafts"},`,
        rust: "waiting",
        after: " for a slot.",
        aside:
          "Skipped by the queue, over a limit, or saved for later. Fix the red ones in Studio, or drop a saved draft into the next open slot.",
      };
    }
    case "frames": {
      const n = counts.frames;
      return {
        before: n === undefined ? "Frames," : `${numberWord(n)} ${n === 1 ? "frame" : "frames"},`,
        rust: "your",
        after: " way of telling it.",
        aside:
          "A frame is the beat structure Studio writes to. Edit the beats, choose where each one fits, or start a new one.",
      };
    }
    case "media":
      return {
        before: "Media Meta can",
        rust: "actually",
        after: " reach.",
        aside:
          "Instagram fetches media from a public link at posting time. Every file is checked before it can be queued.",
      };
  }
}
