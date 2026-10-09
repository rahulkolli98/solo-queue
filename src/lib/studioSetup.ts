/**
 * What a Studio run writes, per format: whether it is included, the story frame and (threads) the post
 * count. Everything starts from the saved defaults (`settings.voice.formatDefaults`, then the older single
 * defaults), so pressing Generate with no changes does the usual thing; the founder only overrides.
 * Pure, so each rule is unit tested. The defaults rules themselves live in convex/lib/formatSetup.ts.
 */
import {
  FIT_OF,
  defaultInclude,
  frameFitsKind,
  resolveCount,
  resolveFrameKey,
  type FormatDefaults,
} from "../../convex/lib/formatSetup";
import { DEFAULT_SLIDE_COUNT, clampSlideCount } from "../../convex/lib/carouselDraft";
import { DEFAULT_THEME, THEMES, isThemeKey, themeName } from "../../convex/lib/themes";
import type { FrameFit } from "../../convex/lib/framesModel";
import { POSTS_FALLBACK, clampPosts } from "@/lib/studioCompose";
import { KIND_META, type DraftKind } from "@/lib/studioModel";

/** The carousel frame select's value for "no story frame: I will describe it". */
export const NO_FRAME = "__none__";

/** The formats Studio can write, in display order. */
export const SETUP_ROWS: readonly DraftKind[] = ["threads", "caption", "reel", "carousel", "blog"];

export interface SetupFrame {
  key: string;
  name: string;
  fits: readonly FrameFit[];
  isActive?: boolean;
  beats: readonly { label: string }[];
}

/** What the founder changed for this run (nothing here = use the default). */
export interface SetupChoice {
  include?: boolean;
  frameKey?: string;
  count?: number;
  /** Carousel: write it without a story frame, from the description alone. */
  noFrame?: boolean;
  /** Carousel: how the founder wants it to read and look, in their own words. */
  brief?: string;
  /** Carousel: a saved look (a slide plan, a design document, reference images); "" means none. */
  lookKey?: string;
  /** Carousel: the design (theme) to draw it in, a key from convex/lib/themes.ts. */
  theme?: string;
}
export type SetupChoices = Partial<Record<DraftKind, SetupChoice>>;

export interface SetupInput {
  choices: SetupChoices;
  defaults: FormatDefaults | undefined;
  legacyDefaultKey: string | undefined;
  legacyPostCount: number | undefined;
  frames: readonly SetupFrame[];
  /** The story frame each existing draft used, so Regenerate keeps it unless it is changed. */
  usedFrame?: Partial<Record<DraftKind, string | undefined>>;
  /** Kinds that already have a draft (the blog is written again when it exists, unless unticked). */
  hasDraft?: Partial<Record<DraftKind, boolean>>;
  /** The saved carousel looks, for the select. */
  looks?: readonly { key: string; name: string; theme?: string }[];
  /** The look the existing carousel was written with, so Regenerate keeps it unless it is changed. */
  usedLook?: string;
  /** The theme the existing carousel is drawn in, so Regenerate keeps it unless it is changed. */
  usedTheme?: string;
}

export interface SetupRow {
  kind: DraftKind;
  label: string;
  include: boolean;
  /** The story frame in use, or undefined (the blog never has one; a format may have none that fits). */
  frame: { key: string; name: string } | undefined;
  /** Frames that fit this format, for the select. Empty for the blog. */
  frameOptions: { key: string; name: string; isDefault: boolean }[];
  /** Threads: posts in the thread. Carousel: slides. */
  count: number | undefined;
  /** Carousel: written with no story frame (the description, or the material, sets the shape). */
  noFrame: boolean;
  /** Carousel: what the founder asked for this run, "" when nothing. */
  brief: string;
  /** Carousel: the saved look in use ("" none), its name, and the looks to pick from. */
  look: string;
  lookName: string;
  lookOptions: { key: string; name: string }[];
  /**
   * Carousel: the design (theme) in effect, a key from themes.ts: picked now, else the one the existing carousel is
   * drawn in, else the chosen look's, else Solo Queue. Other formats: "".
   */
  theme: string;
  /** The themes to pick from (carousel only). */
  themeOptions: { key: string; name: string }[];
  /** Carousel: the theme to send with the run, or undefined (the drafting action then follows the look, else Solo Queue). */
  themeToSend: string | undefined;
  /** Differs from what is saved, so "Make default" has something to save. */
  changed: boolean;
}

function usableFrame(frames: readonly SetupFrame[], key: string | undefined, kind: DraftKind): SetupFrame | undefined {
  if (!key) return undefined;
  const frame = frames.find((f) => f.key === key);
  return frame && frame.isActive !== false && frameFitsKind(frame, kind) ? frame : undefined;
}

/** The saved default frame for a format, as Studio and the drafting action both resolve it. */
export function defaultFrameOf(input: Pick<SetupInput, "defaults" | "legacyDefaultKey" | "frames">, kind: DraftKind): string | undefined {
  return resolveFrameKey({ kind, defaults: input.defaults, legacyDefaultKey: input.legacyDefaultKey, frames: input.frames });
}

export function buildSetupRows(input: SetupInput): SetupRow[] {
  return SETUP_ROWS.map((kind) => {
    const choice = input.choices[kind] ?? {};
    const savedFrameKey = defaultFrameOf(input, kind);
    const savedInclude = defaultInclude(kind, input.defaults);
    // The blog row is ticked when a blog draft already exists, as before (Regenerate rewrites it).
    const baseInclude = kind === "blog" && input.hasDraft?.blog ? true : savedInclude;
    const include = choice.include ?? baseInclude;

    const hasFrame = FIT_OF[kind] !== null;
    // Picked now, else the frame the existing draft used, else the saved default.
    const noFrame = kind === "carousel" && choice.noFrame === true;
    // Picked now ("" is none), else the look the existing carousel used; only a look that still exists counts.
    const wantedLook = choice.lookKey !== undefined ? choice.lookKey : (input.usedLook ?? "");
    const lookKey = kind === "carousel" && input.looks?.some((l) => l.key === wantedLook) ? wantedLook : "";
    // Picked now, else the theme the existing carousel is drawn in, else the chosen look's, else Solo Queue.
    const explicitTheme = isThemeKey(choice.theme) ? choice.theme : isThemeKey(input.usedTheme) ? input.usedTheme : undefined;
    const lookTheme = input.looks?.find((l) => l.key === lookKey)?.theme;
    const theme = explicitTheme ?? (isThemeKey(lookTheme) ? lookTheme : DEFAULT_THEME);
    const frameKey = hasFrame && !noFrame
      ? (usableFrame(input.frames, choice.frameKey, kind)?.key ??
        usableFrame(input.frames, input.usedFrame?.[kind], kind)?.key ??
        savedFrameKey)
      : undefined;
    const frame = frameKey ? input.frames.find((f) => f.key === frameKey) : undefined;

    const savedCount = resolveCount({ kind, defaults: input.defaults, legacyPostCount: input.legacyPostCount });
    const frameSteps = frame ? frame.beats.length : undefined;
    const count =
      kind === "threads"
        ? clampPosts(choice.count ?? savedCount ?? (frameSteps && frameSteps > 0 ? frameSteps : POSTS_FALLBACK))
        : kind === "carousel"
          ? clampSlideCount(choice.count ?? savedCount ?? DEFAULT_SLIDE_COUNT)
          : undefined;

    const frameOptions = hasFrame
      ? input.frames
          .filter((f) => f.isActive !== false && frameFitsKind(f, kind))
          .map((f) => ({ key: f.key, name: f.name, isDefault: f.key === savedFrameKey }))
      : [];

    // What the thread length would be with nothing changed: the saved length, else the saved frame's steps.
    const savedFrame = savedFrameKey ? input.frames.find((f) => f.key === savedFrameKey) : undefined;
    const savedBaseline =
      kind === "carousel"
        ? clampSlideCount(savedCount ?? DEFAULT_SLIDE_COUNT)
        : clampPosts(savedCount ?? (savedFrame && savedFrame.beats.length > 0 ? savedFrame.beats.length : POSTS_FALLBACK));
    const changed =
      (choice.include !== undefined && choice.include !== savedInclude) ||
      (hasFrame && frameKey !== undefined && frameKey !== savedFrameKey) ||
      ((kind === "threads" || kind === "carousel") && count !== undefined && count !== savedBaseline);
    return {
      kind,
      label: KIND_META[kind].label,
      include,
      frame: frame ? { key: frame.key, name: frame.name } : undefined,
      frameOptions,
      count,
      noFrame,
      brief: kind === "carousel" ? (choice.brief ?? "") : "",
      look: kind === "carousel" ? lookKey : "",
      lookName: kind === "carousel" ? (input.looks?.find((l) => l.key === lookKey)?.name ?? "") : "",
      lookOptions: kind === "carousel" ? (input.looks ?? []).map((l) => ({ key: l.key, name: l.name })) : [],
      theme: kind === "carousel" ? theme : "",
      themeOptions: kind === "carousel" ? THEMES.map((t) => ({ key: t.key, name: t.name })) : [],
      themeToSend: kind === "carousel" ? explicitTheme : undefined,
      changed,
    };
  });
}

/** "Threads · Confession · 4 posts   Caption · Caption: hook, value, ask   Reel script · Confession" */
export function setupSummary(rows: readonly SetupRow[]): string {
  const parts = rows
    .filter((r) => r.include)
    .map((r) => {
      const bits = [r.label];
      if (r.frame) bits.push(r.frame.name);
      else if (r.noFrame) bits.push(r.brief.trim() ? "Your description" : "No story frame");
      if (r.kind === "carousel" && r.theme && r.theme !== DEFAULT_THEME) bits.push(`Design: ${themeName(r.theme)}`);
      if (r.look && r.lookName) bits.push(`Look: ${r.lookName}`);
      if (r.kind === "threads" && r.count !== undefined) bits.push(`${r.count} posts`);
      if (r.kind === "carousel" && r.count !== undefined) bits.push(r.count === 1 ? "1 slide" : `${r.count} slides`);
      return bits.join(" · ");
    });
  return parts.length === 0 ? "Nothing is ticked to write." : parts.join("   ");
}

/** The kinds this run writes, in order. */
export function includedKinds(rows: readonly SetupRow[]): DraftKind[] {
  return rows.filter((r) => r.include).map((r) => r.kind);
}

/** Which of the kinds a run writes carry a per-format choice to send to `drafting.generate`. */
export interface GenerateSetup {
  threads?: { frameKey?: string; count?: number };
  caption?: { frameKey?: string };
  reel?: { frameKey?: string };
  carousel?: { frameKey?: string; count?: number; brief?: string; noFrame?: boolean; lookKey?: string; theme?: string };
}

/**
 * The choices to send: the story frame for each included format that has one, and the thread length only
 * when it differs from what the frame or saved default would give (so an untouched run sends no count).
 */
export function setupToSend(rows: readonly SetupRow[], input: Pick<SetupInput, "defaults" | "legacyPostCount" | "frames">): GenerateSetup {
  const out: GenerateSetup = {};
  for (const row of rows) {
    if (!row.include) continue;
    if (row.kind === "threads") {
      const saved = resolveCount({ kind: "threads", defaults: input.defaults, legacyPostCount: input.legacyPostCount });
      const frame = row.frame ? input.frames.find((f) => f.key === row.frame!.key) : undefined;
      const frameDefault = clampPosts(frame && frame.beats.length > 0 ? frame.beats.length : POSTS_FALLBACK);
      const baseline = saved !== undefined ? clampPosts(saved) : frameDefault;
      const entry: NonNullable<GenerateSetup["threads"]> = {};
      if (row.frame) entry.frameKey = row.frame.key;
      if (row.count !== undefined && row.count !== baseline) entry.count = row.count;
      if (Object.keys(entry).length) out.threads = entry;
    } else if (row.kind === "caption" || row.kind === "reel") {
      if (row.frame) out[row.kind] = { frameKey: row.frame.key };
    } else if (row.kind === "carousel") {
      const saved = resolveCount({ kind: "carousel", defaults: input.defaults });
      const baseline = clampSlideCount(saved ?? DEFAULT_SLIDE_COUNT);
      const entry: NonNullable<GenerateSetup["carousel"]> = {};
      if (row.noFrame) entry.noFrame = true;
      else if (row.frame) entry.frameKey = row.frame.key;
      if (row.count !== undefined && row.count !== baseline) entry.count = row.count;
      if (row.brief.trim()) entry.brief = row.brief.trim();
      if (row.look) entry.lookKey = row.look;
      // Only a theme the founder picked, or the one the existing carousel has: otherwise the look's theme applies.
      if (row.themeToSend) entry.theme = row.themeToSend;
      if (Object.keys(entry).length) out.carousel = entry;
    }
  }
  return out;
}

/**
 * The setup for "Draft this" on an angle card: only that angle's format is ticked and its story frame is picked
 * (a frame that does not fit the format is ignored by the rows, so the saved default applies).
 */
export function choicesForAngle(angle: { kind: DraftKind; frameKey?: string }): SetupChoices {
  const out: SetupChoices = {};
  for (const kind of SETUP_ROWS) {
    out[kind] = kind === angle.kind ? { include: true, ...(angle.frameKey ? { frameKey: angle.frameKey } : {}) } : { include: false };
  }
  return out;
}
