/**
 * Fitting a slide's text into the slide. The image is drawn at a fixed 1080 x 1350, and text that is too tall for it
 * is cut off at the bottom (a third card, the italic line). The model is told the limits, but a long headline over
 * three cards still overflows, so every slide is measured here before it is drawn and, when it would not fit, drawn
 * smaller.
 *
 * `fitSlide` is the one place that decides every size on a slide: `SlideView` draws from it and the height estimate is
 * made from it, so the two cannot disagree. A slide that already fits gets scale 1 and exactly the sizes it always had.
 * When it does not fit, the headline, the text in cards and lists, the figures, the gaps and the margins all shrink
 * together until the estimate fits (never below half size). Text is measured with the real glyph widths of the fonts
 * (carouselMetrics.ts, made by scripts/font-metrics.mjs), wrapped the way the renderer wraps it. Pure, so it is tested.
 */
import { SLIDE_HEIGHT, SLIDE_WIDTH, headlineSize, splitHeadline, type Slide } from "../../convex/lib/carouselSlides";
import { wrapLines, textWidth } from "@/lib/carouselText";

export { textWidth, wrapLines };

export const PAD_X = 80;
export const PAD_TOP = 64;
export const PAD_BOTTOM = 70;
const INNER_W = SLIDE_WIDTH - 2 * PAD_X;
const INNER_H = SLIDE_HEIGHT - PAD_TOP - PAD_BOTTOM;
/** Left unused so a small mismatch between the estimate and the drawing never clips a line. */
const SAFETY = 8;
export const MIN_SCALE = 0.5;
const STEP = 0.02;
/** A card is drawn tilted a degree or so, which makes it a little taller than its box. */
const TILT_ALLOWANCE = 12;
/** The line height of a small monospace label (it has none set, so the font's own). */
const MONO_LINE = 1.32;

/** Every size the renderer needs for one slide, all multiples of the scale `k`. */
export interface Sizes {
  k: number;
  headline: number;
  headMt: number;
  subPx: number;
  subMt: number;
  cardPadTop: number;
  cardPadBottom: number;
  cardPadX: number;
  cardPadXRow: number;
  cardText: number;
  cardTextRow: number;
  big: number;
  bigMb: number;
  labelMb: number;
  labelMbBig: number;
  cardsGap: number;
  rowOffset: number;
  listGap: number;
  listItemGap: number;
  listNum: number;
  listText: number;
  listMt: number;
}

export interface Fit {
  /** 1 when the slide fits as designed; smaller when it was shrunk to fit. */
  k: number;
  sizes: Sizes;
  /** The estimated height of the slide's content at this scale, and what it may use. */
  height: number;
  budget: number;
  /** False only when even the smallest scale does not fit (the text itself is far too long). */
  fits: boolean;
}

function sizesFor(slide: Slide, k: number): Sizes {
  const r = (n: number) => Math.round(n * k);
  const cover = slide.layout === "cover";
  const base = headlineSize(slide.layout, slide.headline);
  return {
    k,
    headline: k === 1 ? base : Math.max(36, Math.round(base * k)),
    headMt: cover ? r(100) : r(36),
    subPx: Math.round((slide.layout === "cards" ? 56 : 64) * 0.8 * k),
    subMt: cover ? r(110) : slide.layout === "close" ? r(90) : r(56),
    cardPadTop: r(40),
    cardPadBottom: r(44),
    cardPadX: r(44),
    cardPadXRow: r(40),
    cardText: r(42),
    cardTextRow: r(36),
    big: r(112),
    bigMb: r(10),
    labelMb: r(18),
    labelMbBig: r(14),
    cardsGap: r(44),
    rowOffset: r(56),
    listGap: r(34),
    listItemGap: r(36),
    listNum: r(96),
    listText: r(44),
    listMt: r(120),
  };
}

function headlineHeight(slide: Slide, size: number): number {
  const ls = -size * 0.062;
  let lines = 0;
  for (const words of splitHeadline(slide.headline, slide.accent)) {
    let n = 1;
    let line = 0;
    for (const w of words) {
      // Each word is its own box with a gap after it (none inside a hyphenated word), and wraps as a whole.
      const item = textWidth("bricolage", w.text, size, ls) + (w.joined ? 0 : size * 0.19);
      if (line > 0 && line + item > INNER_W) {
        n += 1;
        line = item;
      } else line += item;
    }
    lines += n;
  }
  return lines * size * 0.96;
}

function subHeight(slide: Slide, s: Sizes): number {
  if (!slide.sub) return 0;
  return wrapLines("dmSansItalic", slide.sub, s.subPx, -s.subPx * 0.02, INNER_W) * s.subPx * 1.26;
}

function cardsHeight(slide: Slide, s: Sizes): number {
  const cards = slide.cards ?? [];
  if (cards.length === 0) return 0;
  const row = cards.length === 2 && cards.every((c) => c.big);
  const heights = cards.map((card) => {
    const width = row ? 432 : INNER_W;
    const text = row ? s.cardTextRow : s.cardText;
    const inner = width - 2 * (row ? s.cardPadXRow : s.cardPadX);
    const lines = wrapLines("dmSans", card.text, text, -1 * s.k, inner);
    const label = card.label ? Math.round(26 * MONO_LINE) + (card.big ? s.labelMbBig : s.labelMb) : 0;
    const big = card.big ? s.big + s.bigMb : 0;
    return s.cardPadTop + s.cardPadBottom + label + big + lines * text * 1.3;
  });
  const body = row ? Math.max(heights[0], heights[1] + s.rowOffset) : heights.reduce((a, b) => a + b, 0) + s.cardsGap * (cards.length - 1);
  return body + TILT_ALLOWANCE;
}

function listHeight(slide: Slide, s: Sizes): number {
  const items = slide.items ?? [];
  if (items.length === 0) return 0;
  const textWidthPx = INNER_W - s.listNum - s.listItemGap;
  const heights = items.map((item) => {
    const lines = wrapLines("dmSansMedium", item.text, s.listText, -0.8 * s.k, textWidthPx);
    const label = item.label ? Math.round(24 * MONO_LINE) + 8 : 0;
    return Math.max(s.listNum * 0.9, 6 + label + lines * s.listText * 1.22);
  });
  return heights.reduce((a, b) => a + b, 0) + s.listGap * (items.length - 1);
}

/** The estimated height of everything on the slide, top padding and bottom padding left out. */
function contentHeight(slide: Slide, s: Sizes): number {
  const header = 40;
  const head = s.headMt + headlineHeight(slide, s.headline);
  const footer = (slide.layout === "cover" ? 0 : 36) + 36;
  switch (slide.layout) {
    case "cover":
      return header + head + s.subMt + subHeight(slide, s) + footer;
    case "close":
      return header + head + s.subMt + subHeight(slide, s) + 70;
    case "list":
      return header + head + s.listMt + listHeight(slide, s) + footer;
    case "cards":
      return header + head + cardsHeight(slide, s) + (slide.sub ? s.subMt + subHeight(slide, s) : 0) + footer;
    default:
      return 0;
  }
}

/**
 * The sizes to draw `slide` with: the designed sizes when it fits, otherwise the largest scale (down to half) whose
 * estimated height fits the slide. A statement slide is laid out on its own, with room to spare, and is not scaled.
 */
export function fitSlide(slide: Slide): Fit {
  const budget = INNER_H - SAFETY;
  if (slide.layout === "statement") return { k: 1, sizes: sizesFor(slide, 1), height: 0, budget, fits: true };
  const steps = Math.round((1 - MIN_SCALE) / STEP);
  for (let i = 0; i <= steps; i += 1) {
    const k = Math.round((1 - i * STEP) * 100) / 100;
    const sizes = sizesFor(slide, k);
    const height = contentHeight(slide, sizes);
    if (height <= budget) return { k, sizes, height, budget, fits: true };
  }
  const sizes = sizesFor(slide, MIN_SCALE);
  return { k: MIN_SCALE, sizes, height: contentHeight(slide, sizes), budget, fits: false };
}
