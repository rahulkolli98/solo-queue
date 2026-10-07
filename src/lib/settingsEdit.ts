import type { AppSettings, Pillar } from "../../convex/lib/settingsModel";
import {
  KIND_LABEL,
  defaultInclude,
  frameFitsKind,
  resolveCount,
  resolveFrameKey,
  withFormatDefault,
  type FormatDefaults,
  type SetupKind,
} from "../../convex/lib/formatSetup";
import type { FrameFit } from "../../convex/lib/framesModel";

/**
 * Pure helpers for the Voice & writing and Content pillars Settings sections:
 * normalising and validating what the founder types, merging a change into the
 * COMPLETE section object (`settings.update` replaces a whole section), and the
 * numbers behind the target-mix bar. No React, no Convex calls, so they are
 * unit-tested directly.
 */

export type Voice = AppSettings["voice"];

export const VOICE_DESCRIPTION_MAX = 600;
export const SIGN_OFF_MAX = 80;
export const ABOUT_ME_MAX = 1500;
export const STYLE_GUIDE_MAX = 20000;
export const BANNED_WORDS_MAX = 50;
export const BANNED_WORD_MAX_LENGTH = 40;
export const PILLAR_NAME_MAX = 40;
export const PILLAR_DESCRIPTION_MAX = 200;
export const PILLAR_LINKS_MAX = 8;
export const PILLAR_LINK_MAX_LENGTH = 40;

export type EditResult<T> = { ok: true; value: T } | { ok: false; message: string };

/* ---------- never-use words ---------- */

/** Lowercased, trimmed, inner whitespace collapsed. */
export function normaliseBannedWord(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Add a word to the never-use list, or say plainly why it can't be added. */
export function addBannedWord(list: readonly string[], raw: string): EditResult<string[]> {
  const word = normaliseBannedWord(raw);
  if (!word) return { ok: false, message: "Type a word or phrase to add." };
  if (word.length > BANNED_WORD_MAX_LENGTH) {
    return { ok: false, message: `Words and phrases can be up to ${BANNED_WORD_MAX_LENGTH} characters.` };
  }
  if (list.includes(word)) return { ok: false, message: `"${word}" is already on the list.` };
  if (list.length >= BANNED_WORDS_MAX) {
    return { ok: false, message: `The list holds up to ${BANNED_WORDS_MAX} words. Remove one to add another.` };
  }
  return { ok: true, value: [...list, word] };
}

export function removeBannedWord(list: readonly string[], word: string): string[] {
  return list.filter((w) => w !== word);
}

/* ---------- voice ---------- */

/** "Learned from 12 posts" / "Learned from 1 post" / "Not learned from your posts yet". */
export function learnedFromText(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "Not learned from your posts yet";
  return `Learned from ${count} ${count === 1 ? "post" : "posts"}`;
}

export const IG_HASHTAG_CHOICES = [0, 1, 2, 3, 5, 8, 10] as const;

/** The hashtag choices, plus the saved value when it is not one of them. */
export function igHashtagOptions(current: number): number[] {
  const set = new Set<number>(IG_HASHTAG_CHOICES);
  set.add(current);
  return [...set].sort((a, b) => a - b);
}

export interface FrameOption {
  key: string;
  label: string;
}

/** Active frames as select options, keeping the saved key visible even if its frame was retired. */
export function frameOptions(
  frames: ReadonlyArray<{ key: string; name: string }> | undefined,
  savedKey: string
): FrameOption[] {
  const options = (frames ?? []).map((f) => ({ key: f.key, label: f.name }));
  if (savedKey && !options.some((o) => o.key === savedKey)) {
    options.unshift({ key: savedKey, label: frames === undefined ? savedKey : `${savedKey} (not active)` });
  }
  return options;
}

/** The formats the "Defaults by format" table has a row for (the carousel arrives later). */
export const FORMAT_ROW_KINDS: readonly SetupKind[] = ["threads", "caption", "reel", "carousel", "blog"];

/** Posts a thread default can name; 0 (not listed) means "follow the story frame". */
export const THREAD_POST_CHOICES: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
/** Slides in a written carousel. */
export const CAROUSEL_SLIDE_CHOICES: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export interface FormatFrameLike {
  key: string;
  name: string;
  isActive?: boolean;
  fits: readonly FrameFit[];
}

export interface FormatRow {
  kind: SetupKind;
  label: string;
  include: boolean;
  /** False for the blog, which takes no story frame. */
  takesFrame: boolean;
  /** The frame the format uses now, or "" when none applies. */
  frameKey: string;
  /** Active frames that fit this format. */
  frames: FrameOption[];
  /** Threads only: pick the number of posts. */
  takesCount: boolean;
  /** Posts in the thread, or 0 to follow the story frame. */
  count: number;
}

/**
 * The rows of the "Defaults by format" table, from the saved voice settings and the story frames.
 * A saved frame that is retired or does not fit falls through to the next default, as `resolveFrameKey` does
 * everywhere else, so the select always shows what a run would really use.
 */
export function formatDefaultRows(voice: Voice, frames: readonly FormatFrameLike[] | undefined): FormatRow[] {
  const list = frames ?? [];
  return FORMAT_ROW_KINDS.map((kind) => {
    const fitting = list
      .filter((f) => f.isActive !== false && frameFitsKind(f, kind))
      .map((f) => ({ key: f.key, label: f.name }));
    const takesFrame = kind !== "blog";
    const frameKey = takesFrame
      ? (resolveFrameKey({
          kind,
          defaults: voice.formatDefaults,
          legacyDefaultKey: voice.defaultFrameKey,
          frames: list.map((f) => ({ key: f.key, isActive: f.isActive, fits: f.fits })),
        }) ?? "")
      : "";
    return {
      kind,
      label: KIND_LABEL[kind],
      include: defaultInclude(kind, voice.formatDefaults),
      takesFrame,
      frameKey,
      frames: takesFrame ? fitting : [],
      takesCount: kind === "threads" || kind === "carousel",
      count:
        kind === "threads" || kind === "carousel"
          ? (resolveCount({ kind, defaults: voice.formatDefaults, legacyPostCount: voice.defaultPostCount }) ?? 0)
          : 0,
    };
  });
}

/**
 * The voice change for one format's default. `count: null` for Threads (back to "follow the story frame")
 * also sets the older `defaultPostCount` to 0, which would otherwise still apply.
 */
export function formatDefaultChange(
  current: Voice,
  kind: SetupKind,
  change: { include?: boolean | null; frameKey?: string | null; count?: number | null }
): Partial<Voice> {
  const out: Partial<Voice> = { formatDefaults: withFormatDefault(current.formatDefaults, kind, change) };
  if (kind === "threads" && change.count === null) out.defaultPostCount = 0;
  return out;
}

/** A formatDefaults object without empty entries, or undefined when nothing is left. */
function cleanFormatDefaults(raw: FormatDefaults | undefined): FormatDefaults | undefined {
  if (!raw) return undefined;
  const out: FormatDefaults = {};
  for (const [kind, entry] of Object.entries(raw) as [SetupKind, FormatDefaults[SetupKind]][]) {
    if (!entry) continue;
    const kept = Object.fromEntries(Object.entries(entry).filter(([, v]) => v !== undefined));
    if (Object.keys(kept).length > 0) out[kind] = kept;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The next complete `voice` object: the current one with `change` laid over
 * it. An empty or blank sign-off removes the field (the schema's optional
 * string), instead of saving an empty string. An empty `formatDefaults` (or a
 * format with nothing set) is removed the same way.
 */
export function mergeVoice(current: Voice, change: Partial<Voice>): Voice {
  const next: Voice = { ...current, ...change };
  if (typeof next.signOff !== "string" || next.signOff.trim() === "") {
    delete next.signOff;
  } else {
    next.signOff = next.signOff.trim();
  }
  // Blank about-you and style-guide text removes the field instead of saving an empty string.
  for (const key of ["aboutMe", "styleGuide"] as const) {
    const value = next[key];
    if (typeof value !== "string" || value.trim() === "") delete next[key];
    else next[key] = value.trim();
  }
  const formatDefaults = cleanFormatDefaults(next.formatDefaults);
  if (formatDefaults) next.formatDefaults = formatDefaults;
  else delete next.formatDefaults;
  return next;
}

/** Checks a description and a sign-off before they are sent. */
export function validateDescription(text: string): string | null {
  return text.length > VOICE_DESCRIPTION_MAX
    ? `The description can be up to ${VOICE_DESCRIPTION_MAX} characters.`
    : null;
}

export function validateAboutMe(text: string): string | null {
  return text.trim().length > ABOUT_ME_MAX ? `About you can be up to ${ABOUT_ME_MAX} characters.` : null;
}

/** A style guide that is too long is refused with its size, so the founder knows how much to cut. */
export function validateStyleGuide(text: string): string | null {
  const n = text.trim().length;
  return n > STYLE_GUIDE_MAX
    ? `The style guide is ${n.toLocaleString("en-US")} characters; the limit is ${STYLE_GUIDE_MAX.toLocaleString("en-US")}. Cut it down, then save.`
    : null;
}

/** Files the style guide can be loaded from: plain text or Markdown, small enough to read in the browser. */
export const STYLE_GUIDE_FILE_MAX_BYTES = 200_000;
export function checkStyleGuideFile(file: { name: string; size: number }): string | null {
  if (!/\.(md|markdown|txt)$/i.test(file.name)) return "Load a .md or .txt file.";
  if (file.size > STYLE_GUIDE_FILE_MAX_BYTES) return "That file is too large for a style guide. Keep it under 200 KB.";
  return null;
}

export function validateSignOff(text: string): string | null {
  return text.trim().length > SIGN_OFF_MAX ? `The sign-off can be up to ${SIGN_OFF_MAX} characters.` : null;
}

/* ---------- pillars ---------- */

/** A target share as a whole number from 0 to 100, or null when it is not a number. */
export function clampShare(raw: string | number): number | null {
  const n = typeof raw === "number" ? raw : raw.trim() === "" ? NaN : Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function validatePillarName(raw: string): EditResult<string> {
  const name = raw.trim();
  if (!name) return { ok: false, message: "A pillar needs a name." };
  if (name.length > PILLAR_NAME_MAX) {
    return { ok: false, message: `Pillar names can be up to ${PILLAR_NAME_MAX} characters.` };
  }
  return { ok: true, value: name };
}

export function validatePillarDescription(raw: string): EditResult<string> {
  if (raw.length > PILLAR_DESCRIPTION_MAX) {
    return { ok: false, message: `The description can be up to ${PILLAR_DESCRIPTION_MAX} characters.` };
  }
  return { ok: true, value: raw };
}

/** Add a linked product to a pillar (trimmed, no case-insensitive duplicates, at most 8). */
export function addPillarLink(links: readonly string[], raw: string): EditResult<string[]> {
  const link = raw.trim();
  if (!link) return { ok: false, message: "Type a product name to link." };
  if (link.length > PILLAR_LINK_MAX_LENGTH) {
    return { ok: false, message: `Product names can be up to ${PILLAR_LINK_MAX_LENGTH} characters.` };
  }
  if (links.some((l) => l.toLowerCase() === link.toLowerCase())) {
    return { ok: false, message: `"${link}" is already linked.` };
  }
  if (links.length >= PILLAR_LINKS_MAX) {
    return { ok: false, message: `A pillar links up to ${PILLAR_LINKS_MAX} products. Remove one to add another.` };
  }
  return { ok: true, value: [...links, link] };
}

export function removePillarLink(links: readonly string[], link: string): string[] {
  return links.filter((l) => l !== link);
}

/** The next complete `pillars` array: the pillar with this key changed, the others untouched. */
export function mergePillar(pillars: readonly Pillar[], key: string, change: Partial<Omit<Pillar, "key">>): Pillar[] {
  return pillars.map((p) => (p.key === key ? { ...p, ...change } : p));
}

/** `var(--color-pillar-build)` for a pillar colour token; a neutral line colour for anything unexpected. */
export function pillarColorVar(token: string): string {
  return /^pillar-[a-z]+$/.test(token) ? `var(--color-${token})` : "var(--color-line)";
}

export function shareTotal(pillars: readonly Pillar[]): number {
  return pillars.reduce((sum, p) => sum + p.targetShare, 0);
}

export interface MixSegment {
  key: string;
  name: string;
  color: string;
  share: number;
  /** Width as a percent of the whole bar. */
  widthPct: number;
}

/**
 * Segments for the target-mix bar. Each is sized by its share of 100, so a
 * total of 90 leaves a visible gap at the end; above 100 the bar scales down
 * so everything still fits.
 */
export function mixSegments(pillars: readonly Pillar[]): MixSegment[] {
  const basis = Math.max(100, shareTotal(pillars));
  return pillars.map((p) => ({
    key: p.key,
    name: p.name,
    color: p.color,
    share: p.targetShare,
    widthPct: Math.round((p.targetShare / basis) * 10000) / 100,
  }));
}

/** Null when the shares total 100; otherwise a plain warning that does not block saving. */
export function shareTotalWarning(total: number): string | null {
  if (total === 100) return null;
  return `Shares add up to ${total}%. Posts will still be queued; the mix bar is a target.`;
}

/** Screen-reader label for the mix bar. */
export function mixLabel(pillars: readonly Pillar[]): string {
  return pillars.map((p) => `${p.name} ${p.targetShare}%`).join(", ");
}
