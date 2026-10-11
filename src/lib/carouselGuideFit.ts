/**
 * The Orange guide theme's measurements and its fit. Headlines are heavy condensed capitals, centred; each line must
 * fit the width, and a slide that would run off the bottom is drawn smaller (never below half size). The drawing and
 * the estimate read the same numbers, so they cannot disagree. Pure, so it is tested.
 */
import { SLIDE_HEIGHT, SLIDE_WIDTH, splitHeadline, type Slide } from "../../convex/lib/carouselSlides";
import { textWidth, wrapLines } from "@/lib/carouselText";

export const GUIDE_PAD_X = 72;
export const GUIDE_PAD_TOP = 64;
export const GUIDE_PAD_BOTTOM = 56;
export const GUIDE_INNER_W = SLIDE_WIDTH - 2 * GUIDE_PAD_X;
const INNER_H = SLIDE_HEIGHT - GUIDE_PAD_TOP - GUIDE_PAD_BOTTOM;
const SAFETY = 8;
const MIN_SCALE = 0.5;
/** A slide with room to spare is drawn bigger (the boxes and the note), as far as this, so the page is not half empty. */
const MAX_SCALE = 1.35;
const STEP = 0.02;
export const HEAD_LINE = 0.96;
export const PILL_H = 66;
export const FOOT_H = 64;

const HEAD_SIZES: Record<string, number[]> = {
  cover: [230, 210, 188, 168, 148, 128, 112, 96, 84, 72],
  statement: [200, 180, 160, 140, 120, 104, 92, 80, 70],
  close: [190, 170, 150, 132, 116, 100, 88, 76, 66],
  item: [180, 160, 142, 126, 112, 98, 86, 76, 66],
};

/** The visual lines of a headline at `size` (an explicit line break starts a line; a long line wraps). */
export function headLineCount(headline: string, size: number): number {
  // Narrower than the box: the renderer puts a word gap of 0.2 of the size between words, and a headline that lands
  // right on the edge wraps one word early, so a line only counts as fitting when it has some room to spare.
  return wrapLines("anton", headline.toUpperCase(), size, 0, GUIDE_INNER_W * 0.92 - 0.04 * size);
}

/** The widest explicit line of the headline at `size`, in pixels. */
export function widestLine(headline: string, size: number): number {
  return Math.max(...headline.toUpperCase().split("\n").map((l) => textWidth("anton", l, size, 0)));
}

const MAX_LINES: Record<string, number> = { cover: 4, statement: 6, close: 4, item: 3 };

function layoutKey(slide: Slide): string {
  return slide.layout === "cards" || slide.layout === "list" ? "item" : slide.layout;
}

/**
 * Headline sizes to try, best first: the largest size at which no line wraps (the headline's own line breaks are
 * kept, as in the references), then the largest at which it wraps once more, and so on up to the layout's limit.
 */
export function headlineCandidates(slide: Slide): number[] {
  const key = layoutKey(slide);
  const sizes = HEAD_SIZES[key] ?? HEAD_SIZES.item;
  const own = Math.max(1, slide.headline.split(/\r?\n/).length);
  const out: number[] = [];
  for (let extra = 0; own + extra <= Math.max(MAX_LINES[key], own); extra += 1) {
    const size = sizes.find((sz) => headLineCount(slide.headline, sz) <= own + extra);
    if (size !== undefined && !out.includes(size)) out.push(size);
  }
  return out.length ? out : [sizes[sizes.length - 1]];
}

/** The headline size alone (the first candidate), for tests and callers that do not need the whole fit. */
export function guideHeadlineSize(slide: Slide): number {
  return headlineCandidates(slide)[0];
}

export interface GuideSizes {
  k: number;
  headline: number;
  box: number;
  boxPad: number;
  note: number;
  gap: number;
}

export function guideSizes(slide: Slide, k: number, headline: number = guideHeadlineSize(slide)): GuideSizes {
  const r = (n: number) => Math.round(n * k);
  return { k, headline, box: r(40), boxPad: r(34), note: Math.round(50 * Math.min(k, 1.12)), gap: r(30) };
}

/** The lines inside a callout box: a card's text split on line breaks, or the list's items. */
export function boxLines(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean);
}

export interface GuideBox {
  kind: "terminal" | "callout";
  lines: string[];
}

/** The boxes a slide draws: a dark card is a terminal window, any other card a callout, a list is one callout. */
export function guideBoxes(slide: Slide): GuideBox[] {
  if (slide.layout === "list") {
    const lines = (slide.items ?? []).map((i) => i.text);
    return lines.length ? [{ kind: "callout", lines }] : [];
  }
  if (slide.layout === "cards") {
    return (slide.cards ?? []).map((c) => ({ kind: c.tone === "ink" ? ("terminal" as const) : ("callout" as const), lines: boxLines(c.text) }));
  }
  if (slide.layout === "cover" && slide.sub) return [{ kind: "terminal", lines: boxLines(slide.sub) }];
  return [];
}

/** The width a line has inside its box: the box's padding and border, and a window's prompt column, come off the page width. */
function boxInnerWidth(box: GuideBox, s: GuideSizes): number {
  return GUIDE_INNER_W - 2 * s.boxPad - (box.kind === "terminal" ? 60 : 36);
}

/** Whether any line inside a takeaway box or window would wrap at these sizes. */
export function boxesWrap(slide: Slide, s: GuideSizes): boolean {
  return guideBoxes(slide).some((box) => {
    const inner = boxInnerWidth(box, s);
    return box.lines.some((l) => wrapLines("dmMono", l, s.box, 0, inner) > 1);
  });
}

function boxHeight(box: GuideBox, s: GuideSizes): number {
  const inner = boxInnerWidth(box, s);
  const lines = box.lines.reduce((n, l) => n + wrapLines("dmMono", l, s.box, 0, inner), 0);
  return lines * s.box * 1.45 + 2 * s.boxPad + (box.kind === "terminal" ? 64 : 0);
}

/** The estimated height of everything on the slide, paddings left out. */
export function guideContentHeight(slide: Slide, s: GuideSizes): number {
  const head = headLineCount(slide.headline, s.headline) * s.headline * HEAD_LINE + 40;
  const note = slide.note ? s.note * 2.2 : 0;
  const boxes = guideBoxes(slide).reduce((a, b) => a + boxHeight(b, s) + s.gap, 0);
  const panel = slide.layout === "close" ? 520 : 0;
  return PILL_H + head + note + boxes + panel + FOOT_H + 3 * s.gap;
}

export interface GuideFit {
  k: number;
  sizes: GuideSizes;
  fits: boolean;
}

/** The sizes to draw `slide` with: the largest scale (down to half) at which everything fits the page. */
export function fitGuide(slide: Slide): GuideFit {
  const budget = INNER_H - SAFETY;
  const steps = Math.round((MAX_SCALE - MIN_SCALE) / STEP);
  const candidates = headlineCandidates(slide);
  // First choice: every line in the boxes stays on one line (the references' three short lines); only when no size
  // down to 0.7 allows that does a box line wrap.
  for (const strict of [true, false]) {
    for (let i = 0; i <= steps; i += 1) {
      const k = Math.round((MAX_SCALE - i * STEP) * 100) / 100;
      if (strict && k < 0.7) break;
      for (const headline of candidates) {
        const sizes = guideSizes(slide, k, headline);
        if (strict && boxesWrap(slide, sizes)) continue;
        if (guideContentHeight(slide, sizes) <= budget) return { k, sizes, fits: true };
      }
    }
  }
  return { k: MIN_SCALE, sizes: guideSizes(slide, MIN_SCALE), fits: false };
}

/** The words of the last headline line, with the width the accent words take at its right end (for the underline). */
export function underlineSpan(slide: Slide, size: number): { lineWidth: number; accentWidth: number } | null {
  const lines = splitHeadline(slide.headline.toUpperCase(), slide.accent?.toUpperCase());
  const last = lines[lines.length - 1];
  if (!last || !last.some((w) => w.accent)) return null;
  // A line that wraps has no single right end to underline.
  const lastText = slide.headline.split(/\r?\n/).pop() ?? "";
  if (widestLine(lastText, size) > GUIDE_INNER_W - 0.06 * size) return null;
  const gap = size * 0.2;
  const widths = last.map((w) => textWidth("anton", w.text, size, 0));
  let lineWidth = 0;
  last.forEach((w, i) => {
    lineWidth += widths[i] + (i < last.length - 1 && !w.joined ? gap : 0);
  });
  const accent = last.filter((w) => w.accent);
  const accentWidth = accent.reduce((a, w) => a + textWidth("anton", w.text, size, 0), 0) + gap * Math.max(0, accent.length - 1);
  return { lineWidth, accentWidth };
}
