/**
 * The App card theme's measurements and its fit, like carouselKraftFit.ts for Kraft zine: `AppCardSlide` draws from
 * it, so the drawing and the estimate cannot disagree. The headline takes the largest size whose lines fit; a slide
 * of rows that would run off the bottom is drawn smaller (never below half size). Pure, so it is tested.
 */
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from "../../convex/lib/carouselSlides";
import { textWidth, wrapLines } from "@/lib/carouselText";

export const APP_PAD_X = 72;
export const APP_PAD_TOP = 72;
export const APP_PAD_BOTTOM = 72;
export const APP_INNER_W = SLIDE_WIDTH - 2 * APP_PAD_X;
const INNER_H = SLIDE_HEIGHT - APP_PAD_TOP - APP_PAD_BOTTOM;
const SAFETY = 8;
const MIN_SCALE = 0.5;
/** An item slide with room to spare is drawn bigger, as far as this, so the page is not half empty. */
const MAX_SCALE = 1.4;
const STEP = 0.02;
export const PILL_H = 60;
export const BADGE_H = 68;
/** The headline's letter spacing, as a share of its size. */
export const HEAD_TRACK = -0.04;

/** Sizes to try, largest first, and the line counts to allow in turn (a cover or close prefers fewer, bigger lines). */
const HEAD_SIZES: Record<string, { sizes: number[]; lines: number[] }> = {
  cover: { sizes: [190, 168, 148, 128, 112, 96], lines: [2, 3] },
  statement: { sizes: [150, 132, 116, 100, 88, 76], lines: [5, 6, 7] },
  close: { sizes: [150, 130, 112, 96, 84], lines: [3, 4] },
  item: { sizes: [150, 132, 116, 100, 88, 76, 64], lines: [3] },
};

/** The lines a headline takes at `size`. */
export function headlineLines(headline: string, size: number): number {
  // A little narrower than the box: the renderer puts a word gap of 0.2 of the size between words, a touch wider than the font's space.
  return wrapLines("bricolage", headline, size, HEAD_TRACK * size, APP_INNER_W - 0.06 * size);
}

/** The largest headline size whose lines fit the layout's limit (the smallest when none does). */
export function appHeadlineSize(slide: Slide): number {
  const rule = HEAD_SIZES[slide.layout === "cards" || slide.layout === "list" ? "item" : slide.layout] ?? HEAD_SIZES.item;
  for (const max of rule.lines) {
    for (const size of rule.sizes) if (headlineLines(slide.headline, size) <= max) return size;
  }
  return rule.sizes[rule.sizes.length - 1];
}

export interface AppSizes {
  k: number;
  headline: number;
  sub: number;
  rowText: number;
  rowPadY: number;
  rowPadX: number;
  rowGap: number;
  icon: number;
  big: number;
  gap: number;
}

export function appSizes(slide: Slide, k: number): AppSizes {
  const r = (n: number) => Math.round(n * k);
  return {
    k,
    headline: appHeadlineSize(slide),
    sub: r(46),
    rowText: r(38),
    rowPadY: r(30),
    rowPadX: r(34),
    rowGap: r(18),
    icon: r(34),
    big: r(64),
    gap: r(30),
  };
}

/** What each row of an item slide says: a card's text (with its key figure) or a list item's text. */
export function appRows(slide: Slide): { text: string; big?: string }[] {
  if (slide.layout === "list") return (slide.items ?? []).map((i) => ({ text: i.text }));
  return (slide.cards ?? []).map((c) => ({ text: c.text, big: c.big }));
}

function rowHeight(row: { text: string; big?: string }, s: AppSizes): number {
  const bigW = row.big ? textWidth("bricolage", row.big, s.big, HEAD_TRACK * s.big) + 28 : 0;
  const inner = APP_INNER_W - 2 * s.rowPadX - s.icon - 24 - bigW;
  const lines = wrapLines("dmSans", row.text, s.rowText, 0, inner);
  return 2 * s.rowPadY + Math.max(lines * s.rowText * 1.3, row.big ? s.big : 0, s.icon);
}

function subHeight(slide: Slide, s: AppSizes): number {
  if (!slide.sub) return 0;
  return wrapLines("dmSans", slide.sub, s.sub, 0, APP_INNER_W) * s.sub * 1.25;
}

/** The estimated height of an item slide's content, the paddings left out. */
export function appItemHeight(slide: Slide, s: AppSizes): number {
  const rows = appRows(slide);
  const rowsH = rows.reduce((a, r) => a + rowHeight(r, s), 0) + s.rowGap * Math.max(0, rows.length - 1);
  const head = headlineLines(slide.headline, s.headline) * s.headline * 1.02;
  return PILL_H + 60 + head + (slide.sub ? 24 + subHeight(slide, s) : 0) + 40 + rowsH + 40 + BADGE_H;
}

export interface AppFit {
  k: number;
  sizes: AppSizes;
  fits: boolean;
}

/** The sizes to draw `slide` with: the largest scale (from 1.4 down to half) at which an item slide's rows fit the page. */
export function fitAppCard(slide: Slide): AppFit {
  if (slide.layout !== "cards" && slide.layout !== "list") return { k: 1, sizes: appSizes(slide, 1), fits: true };
  const budget = INNER_H - SAFETY;
  const steps = Math.round((MAX_SCALE - MIN_SCALE) / STEP);
  for (let i = 0; i <= steps; i += 1) {
    const k = Math.round((MAX_SCALE - i * STEP) * 100) / 100;
    const sizes = appSizes(slide, k);
    if (appItemHeight(slide, sizes) <= budget) return { k, sizes, fits: true };
  }
  return { k: MIN_SCALE, sizes: appSizes(slide, MIN_SCALE), fits: false };
}
