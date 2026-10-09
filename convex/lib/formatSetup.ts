import type { FrameFit } from "./framesModel";

/**
 * Per-format setup: which formats a run writes, which story frame each uses and how long the thread is.
 * Pure rules shared by the drafting action (what to write) and Studio, Library and Settings (what to
 * preselect), so a default means the same thing everywhere.
 *
 * The saved defaults live in `settings.voice.formatDefaults`. Older settings only have the single
 * `defaultFrameKey` and `defaultPostCount`; they still count (no migration).
 */

export type SetupKind = "threads" | "caption" | "reel" | "carousel" | "blog";

export const SETUP_KINDS: readonly SetupKind[] = ["threads", "caption", "reel", "carousel", "blog"];

/** The frame fit each format takes. The blog draft takes no frame. */
export const FIT_OF: Record<SetupKind, FrameFit | null> = {
  threads: "thread",
  caption: "single",
  reel: "reel",
  carousel: "carousel",
  blog: null,
};

export const KIND_LABEL: Record<SetupKind, string> = {
  threads: "Threads",
  caption: "Caption",
  reel: "Reel script",
  carousel: "Carousel",
  blog: "Blog",
};

/** Where a carousel is posted. */
export type CarouselTarget = "instagram" | "threads";
export const CAROUSEL_TARGETS: readonly CarouselTarget[] = ["instagram", "threads"];

export interface FormatDefault {
  include?: boolean;
  frameKey?: string;
  /** Threads: posts in the thread. Carousel: slides. */
  count?: number;
  /** Carousel: the platforms it is written for and posted to. Unset means Instagram only. */
  targets?: CarouselTarget[];
}

export type FormatDefaults = Partial<Record<SetupKind, FormatDefault>>;

/** The frame a fresh install uses for a format when nothing else is saved (the seeded Instagram frames). */
export const FALLBACK_FRAME: Partial<Record<SetupKind, string>> = {
  caption: "ig-caption",
  reel: "ig-reel",
  carousel: "ig-carousel",
};

/** What is written when nothing is saved: the three queueable formats, not the blog. The carousel arrives later. */
export function defaultInclude(kind: SetupKind, defaults: FormatDefaults | undefined): boolean {
  const saved = defaults?.[kind]?.include;
  if (saved !== undefined) return saved;
  return kind === "threads" || kind === "caption" || kind === "reel";
}

interface FrameRef {
  key: string;
  isActive?: boolean;
  fits: readonly FrameFit[];
}

/** Does this frame suit this format? (Any frame suits none for the blog.) */
export function frameFitsKind(frame: { fits: readonly FrameFit[] }, kind: SetupKind): boolean {
  const fit = FIT_OF[kind];
  return fit !== null && frame.fits.includes(fit);
}

/**
 * The frame a format uses when the run did not choose one: the saved default for that format, then the
 * older single default, then the seeded frame for the format, else none. Only active frames that fit the
 * format count, so a retired or mismatched default falls through instead of producing a bad prompt.
 */
export function resolveFrameKey(input: {
  kind: SetupKind;
  defaults?: FormatDefaults;
  legacyDefaultKey?: string;
  frames: readonly FrameRef[];
}): string | undefined {
  const usable = (key: string | undefined): string | undefined => {
    if (!key) return undefined;
    const frame = input.frames.find((f) => f.key === key);
    return frame && frame.isActive !== false && frameFitsKind(frame, input.kind) ? key : undefined;
  };
  if (FIT_OF[input.kind] === null) return undefined;
  return (
    usable(input.defaults?.[input.kind]?.frameKey) ??
    usable(input.legacyDefaultKey) ??
    usable(FALLBACK_FRAME[input.kind])
  );
}

/**
 * The thread length or slide count to use when the run did not choose one: the saved default for the
 * format, then (threads only) the older `defaultPostCount`. Undefined means "the frame decides".
 */
export function resolveCount(input: {
  kind: SetupKind;
  defaults?: FormatDefaults;
  legacyPostCount?: number;
}): number | undefined {
  const saved = input.defaults?.[input.kind]?.count;
  // A carousel can be a single slide; a thread needs at least two posts.
  if (saved !== undefined && saved >= (input.kind === "carousel" ? 1 : 2)) return saved;
  if (input.kind === "threads" && input.legacyPostCount !== undefined && input.legacyPostCount >= 2) {
    return input.legacyPostCount;
  }
  return undefined;
}

/**
 * Where a carousel is posted: this run's pick, else the saved default, else Instagram only. Always at least one
 * platform, in a fixed order, so an empty or unknown pick never leaves the carousel with nowhere to go.
 */
export function resolveTargets(input: { defaults?: FormatDefaults; picked?: readonly CarouselTarget[] }): CarouselTarget[] {
  const chosen = (list: readonly CarouselTarget[] | undefined) => {
    const known = CAROUSEL_TARGETS.filter((t) => list?.includes(t));
    return known.length > 0 ? known : undefined;
  };
  return chosen(input.picked) ?? chosen(input.defaults?.carousel?.targets) ?? ["instagram"];
}

/**
 * The saved defaults with one format's default replaced. `null` removes a field, so "no default" goes back
 * to following the frame. A format left with nothing is dropped, and so is an empty record.
 */
export function withFormatDefault(
  defaults: FormatDefaults | undefined,
  kind: SetupKind,
  change: { include?: boolean | null; frameKey?: string | null; count?: number | null; targets?: CarouselTarget[] | null }
): FormatDefaults | undefined {
  const next: FormatDefault = { ...(defaults?.[kind] ?? {}) };
  for (const field of ["include", "frameKey", "count", "targets"] as const) {
    const value = change[field];
    if (value === undefined) continue;
    if (value === null) delete next[field];
    else (next as Record<string, unknown>)[field] = value;
  }
  const out: FormatDefaults = { ...(defaults ?? {}) };
  if (Object.keys(next).length === 0) delete out[kind];
  else out[kind] = next;
  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * One frame is the default for a format at a time. Making a frame the default for a format clears the same
 * format's earlier pick; clearing removes it only if this frame is the one saved.
 */
export function setFrameDefault(
  defaults: FormatDefaults | undefined,
  kind: SetupKind,
  frameKey: string,
  on: boolean
): FormatDefaults | undefined {
  if (on) return withFormatDefault(defaults, kind, { frameKey });
  if (defaults?.[kind]?.frameKey !== frameKey) return defaults;
  return withFormatDefault(defaults, kind, { frameKey: null });
}

/** The formats a frame is the saved default for, in display order (for the "DEFAULT · THREADS" chips). */
export function defaultsOfFrame(defaults: FormatDefaults | undefined, frameKey: string): SetupKind[] {
  return SETUP_KINDS.filter((k) => defaults?.[k]?.frameKey === frameKey);
}
