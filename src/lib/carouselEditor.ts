import {
  MAX_SLIDES,
  MIN_SLIDES,
  SLIDE_LAYOUTS,
  SLIDE_TONES,
  slideSchema,
  validateSlide,
  type Slide,
  type SlideCard,
  type SlideLayout,
  type SlideTone,
} from "../../convex/lib/carouselSlides";
import { DEFAULT_THEME, themeOf } from "../../convex/lib/themes";
import { CAPTION_LIMIT, charLen } from "@/lib/draftText";

/**
 * Pure helpers the Studio's carousel editor is built on: edit a list of slides without mutating it, check each
 * slide with words the founder can read, count the caption, and ask the image route for one slide. Nothing here
 * touches React or Convex, so all of it is unit tested.
 */

export const MAX_CARDS = 3;
export const MAX_ITEMS = 5;
export const MAX_PILLS = 3;
export const DEFAULT_PILLS = ["Follow", "Save", "Share"] as const;

export const LAYOUT_LABELS: Record<SlideLayout, string> = {
  cover: "Cover",
  cards: "Cards",
  list: "List",
  close: "Close",
  statement: "Statement",
};

export const TONE_LABELS: Record<SlideTone, string> = {
  coral: "Coral",
  cream: "Cream",
  ink: "Ink",
  pink: "Pink",
  yellow: "Yellow",
  blue: "Blue",
};

export { SLIDE_LAYOUTS, SLIDE_TONES, MAX_SLIDES, MIN_SLIDES };

/** The next slide colour after `from` that is none of `avoid`. */
export function nextTone(from: SlideTone | undefined, avoid: readonly (SlideTone | undefined)[]): SlideTone {
  const start = from ? SLIDE_TONES.indexOf(from) + 1 : 0;
  for (let k = 0; k < SLIDE_TONES.length; k += 1) {
    const tone = SLIDE_TONES[(start + k) % SLIDE_TONES.length];
    if (!avoid.includes(tone)) return tone;
  }
  return SLIDE_TONES[start % SLIDE_TONES.length];
}

/** A copy of the slide with `patch` applied; a patched value of undefined removes the field. */
function withPatch<T extends object>(base: T, patch: Partial<T>): T {
  const next: Record<string, unknown> = { ...base, ...patch };
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
  return next as T;
}

export function updateSlide(slides: readonly Slide[], index: number, patch: Partial<Slide>): Slide[] {
  if (index < 0 || index >= slides.length) return [...slides];
  return slides.map((slide, i) => (i === index ? withPatch(slide, patch) : slide));
}

/** Move a slide one place left (-1) or right (1). At the ends it stays where it is. */
export function moveSlide(slides: readonly Slide[], index: number, dir: -1 | 1): Slide[] {
  const target = index + dir;
  if (index < 0 || index >= slides.length || target < 0 || target >= slides.length) return [...slides];
  const next = [...slides];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Remove a slide, never leaving fewer than MIN_SLIDES. */
export function removeSlide(slides: readonly Slide[], index: number): Slide[] {
  if (slides.length <= MIN_SLIDES || index < 0 || index >= slides.length) return [...slides];
  return slides.filter((_, i) => i !== index);
}

/**
 * Add a plain cards slide after `afterIndex` (-1 puts it first), never past MAX_SLIDES. Its colour is the next one
 * in the rotation after the slide before it that is neither neighbour's colour. The layout is left as "cards": the
 * founder chooses cover or close.
 */
export function addSlide(slides: readonly Slide[], afterIndex: number): Slide[] {
  if (slides.length >= MAX_SLIDES) return [...slides];
  const at = Math.min(Math.max(afterIndex, -1), slides.length - 1);
  const before = slides[at]?.tone;
  const after = slides[at + 1]?.tone;
  const slide: Slide = { layout: "cards", tone: nextTone(before, [before, after]), headline: "New slide" };
  const next = [...slides];
  next.splice(at + 1, 0, slide);
  return next;
}

/**
 * Change a slide's layout. The text stays (so switching back loses nothing); a close slide gets the usual pills
 * if it has none, and a statement slide (one big line, no lists) drops the cards, items and pills it cannot show. No field is invented otherwise: a cards slide with no cards is valid.
 */
export function setLayout(slide: Slide, layout: SlideLayout): Slide {
  const next: Slide = { ...slide, layout };
  if (layout === "statement") {
    delete next.cards;
    delete next.items;
    delete next.pills;
  }
  if (layout === "close" && !(slide.pills && slide.pills.length > 0)) next.pills = [...DEFAULT_PILLS];
  return next;
}

/* ---- the lists on a slide: cards, items and pills ---- */

export function addCard(slide: Slide): Slide {
  const cards = slide.cards ?? [];
  if (cards.length >= MAX_CARDS) return slide;
  const last = cards[cards.length - 1]?.tone;
  const card: SlideCard = { text: "New card", tone: nextTone(last ?? slide.tone, [slide.tone, last]) };
  return { ...slide, cards: [...cards, card] };
}

export function updateCard(slide: Slide, index: number, patch: Partial<SlideCard>): Slide {
  const cards = slide.cards ?? [];
  if (index < 0 || index >= cards.length) return slide;
  return { ...slide, cards: cards.map((c, i) => (i === index ? withPatch(c, patch) : c)) };
}

export function removeCard(slide: Slide, index: number): Slide {
  return { ...slide, cards: (slide.cards ?? []).filter((_, i) => i !== index) };
}

type SlideItem = NonNullable<Slide["items"]>[number];

export function addItem(slide: Slide): Slide {
  const items = slide.items ?? [];
  if (items.length >= MAX_ITEMS) return slide;
  return { ...slide, items: [...items, { text: "New item" }] };
}

export function updateItem(slide: Slide, index: number, patch: Partial<SlideItem>): Slide {
  const items = slide.items ?? [];
  if (index < 0 || index >= items.length) return slide;
  return { ...slide, items: items.map((c, i) => (i === index ? withPatch(c, patch) : c)) };
}

export function removeItem(slide: Slide, index: number): Slide {
  return { ...slide, items: (slide.items ?? []).filter((_, i) => i !== index) };
}

export function addPill(slide: Slide): Slide {
  const pills = slide.pills ?? [];
  if (pills.length >= MAX_PILLS) return slide;
  const fresh = DEFAULT_PILLS.find((p) => !pills.includes(p)) ?? "More";
  return { ...slide, pills: [...pills, fresh] };
}

export function updatePill(slide: Slide, index: number, text: string): Slide {
  const pills = slide.pills ?? [];
  if (index < 0 || index >= pills.length) return slide;
  return { ...slide, pills: pills.map((p, i) => (i === index ? text : p)) };
}

export function removePill(slide: Slide, index: number): Slide {
  return { ...slide, pills: (slide.pills ?? []).filter((_, i) => i !== index) };
}

/* ---- tidy, compare, check ---- */

const blank = (s: string | undefined) => s === undefined || s.trim() === "";

/**
 * The slide as it is saved and drawn: blank optional text is dropped and the keys come in a fixed order, so two
 * slides that read the same compare the same. Text is not trimmed here (that would move the founder's cursor);
 * the slide schema trims it on save.
 */
export function tidySlide(slide: Slide): Slide {
  const out: Record<string, unknown> = { layout: slide.layout, tone: slide.tone };
  if (!blank(slide.kicker)) out.kicker = slide.kicker;
  out.headline = slide.headline;
  if (!blank(slide.accent)) out.accent = slide.accent;
  if (!blank(slide.sub)) out.sub = slide.sub;
  if (!blank(slide.tag)) out.tag = slide.tag;
  if (!blank(slide.note)) out.note = slide.note;
  if (slide.cards) {
    out.cards = slide.cards.map((c) => {
      const card: Record<string, unknown> = {};
      if (!blank(c.label)) card.label = c.label;
      if (!blank(c.big)) card.big = c.big;
      card.text = c.text;
      card.tone = c.tone;
      return card;
    });
  }
  if (slide.items) {
    out.items = slide.items.map((it) => {
      const item: Record<string, unknown> = {};
      if (!blank(it.label)) item.label = it.label;
      item.text = it.text;
      return item;
    });
  }
  if (slide.pills) out.pills = [...slide.pills];
  return out as unknown as Slide;
}

/** The tidy slide run through the slide schema when it passes (trimmed text); the tidy slide itself when not. */
export function normalizeSlide(slide: Slide): Slide {
  const tidy = tidySlide(slide);
  const checked = validateSlide(tidy);
  return checked.ok ? checked.slide : tidy;
}

/** True when the two lists read the same once tidied (key order, blank optional text and spacing do not count). */
export function slidesEqual(a: readonly Slide[], b: readonly Slide[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((slide, i) => JSON.stringify(normalizeSlide(slide)) === JSON.stringify(normalizeSlide(b[i])));
}

/** The key a drawn slide is cached under: its tidy content, where it sits and the theme it is drawn in. */
export function slideKey(slide: Slide, index: number, total: number, theme?: string): string {
  return JSON.stringify([normalizeSlide(slide), index, total, themeOf(theme)]);
}

const FIELD_NAMES: Record<string, string> = {
  kicker: "Kicker",
  headline: "Headline",
  accent: "Accent word",
  sub: "Italic line",
  tag: "Tag",
  note: "Note",
};
const PART_NAMES: Record<string, string> = { label: "label", big: "big figure", text: "text", tone: "colour" };

function describeIssue(issue: { code: string; path: PropertyKey[]; message: string; maximum?: unknown }): string {
  const [head, idx, leaf] = issue.path;
  const max = typeof issue.maximum === "number" || typeof issue.maximum === "bigint" ? Number(issue.maximum) : undefined;
  const tooSmall = issue.code === "too_small";
  const tooBig = issue.code === "too_big";
  const n = typeof idx === "number" ? idx + 1 : null;
  if (head === "cards" || head === "items") {
    const noun = head === "cards" ? "Card" : "Item";
    if (n === null) return tooBig && max !== undefined ? `A slide can have at most ${max} ${head}.` : issue.message;
    const part = PART_NAMES[String(leaf)] ?? "text";
    if (tooSmall && leaf === "text") return `${noun} ${n} needs text.`;
    if (tooBig && max !== undefined) return `${noun} ${n} ${part} is over ${max} characters.`;
    return `${noun} ${n}: ${issue.message}`;
  }
  if (head === "pills") {
    if (n === null) return tooBig && max !== undefined ? `A slide can have at most ${max} pills.` : issue.message;
    if (tooSmall) return `Pill ${n} is empty.`;
    if (tooBig && max !== undefined) return `Pill ${n} is over ${max} characters.`;
    return `Pill ${n}: ${issue.message}`;
  }
  const name = FIELD_NAMES[String(head)];
  if (head === "headline" && tooSmall) return "Add a headline.";
  if (name && tooBig && max !== undefined) return `${name} is over ${max} characters.`;
  if (name) return `${name}: ${issue.message}`;
  return issue.message;
}

/** What is wrong with one slide, in plain words (empty when it is fine). */
export function slideIssues(slide: Slide): string[] {
  const parsed = slideSchema.safeParse(tidySlide(slide));
  if (parsed.success) return [];
  return [...new Set(parsed.error.issues.map((issue) => describeIssue(issue as Parameters<typeof describeIssue>[0])))];
}

/** What is wrong with each slide: one list per slide, empty for a slide that passes. */
export function slideProblems(slides: readonly Slide[]): string[][] {
  return slides.map((slide) => slideIssues(slide));
}

export interface CaptionCount {
  length: number;
  max: number;
  /** "123 / 2,200" */
  label: string;
  over: boolean;
  overBy: number;
}

/** The Instagram caption's length against its 2,200 limit (emoji count once). */
export function captionCount(caption: string): CaptionCount {
  const length = charLen(caption.trim());
  const overBy = Math.max(0, length - CAPTION_LIMIT);
  return {
    length,
    max: CAPTION_LIMIT,
    label: `${length.toLocaleString("en-GB")} / ${CAPTION_LIMIT.toLocaleString("en-GB")}`,
    over: overBy > 0,
    overBy,
  };
}

/* ---- asking the image route for one slide ---- */

export class SlideDrawError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "SlideDrawError";
    this.status = status;
  }
}

export const SLIDE_ROUTE = "/api/carousel/slide";

/**
 * POST one slide to the image route and return the PNG. A 400 or 500 throws a SlideDrawError carrying the route's
 * own `{error}` text; a dropped connection throws one too. An abort is passed through untouched.
 */
export async function drawSlide(
  fetchFn: typeof fetch,
  slide: Slide,
  index: number,
  total: number,
  signal?: AbortSignal,
  /** The design to draw in (themes.ts); the default is not sent. */
  theme?: string
): Promise<Blob> {
  let res: Response;
  const chosen = themeOf(theme);
  try {
    res = await fetchFn(SLIDE_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slide: normalizeSlide(slide), index, total, ...(chosen === DEFAULT_THEME ? {} : { theme: chosen }) }),
      signal,
    });
  } catch (e) {
    if (signal?.aborted || (e instanceof Error && e.name === "AbortError")) throw e;
    throw new SlideDrawError("Check your connection and try again.", 0);
  }
  if (!res.ok) {
    let message = `The slide service answered ${res.status}.`;
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === "string" && body.error.trim()) message = body.error.trim();
    } catch {
      // keep the generic line
    }
    throw new SlideDrawError(message, res.status);
  }
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) throw new SlideDrawError("The slide service did not send an image.", res.status);
  return blob;
}
