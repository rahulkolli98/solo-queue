/**
 * The Kraft zine theme's measurements and its fit. Like carouselFit.ts for the Solo Queue design, this is the one place
 * that decides every size on a Kraft slide: `KraftSlide` draws from it and the height estimate is made from it, so
 * they cannot disagree. A slide that fits gets scale 1; one that would run off the bottom is drawn smaller (never
 * below half size). Pure, so it is tested.
 */
import { SLIDE_HEIGHT, SLIDE_WIDTH, splitHeadline, type Slide } from "../../convex/lib/carouselSlides";
import { textWidth, wrapLines } from "@/lib/carouselText";

export const KRAFT_PAD_X = 80;
export const KRAFT_PAD_TOP = 56;
export const KRAFT_PAD_BOTTOM = 60;
const INNER_W = SLIDE_WIDTH - 2 * KRAFT_PAD_X;
const INNER_H = SLIDE_HEIGHT - KRAFT_PAD_TOP - KRAFT_PAD_BOTTOM;
const SAFETY = 8;
const MIN_SCALE = 0.5;
const STEP = 0.02;
/** A slide with room to spare is drawn bigger, as far as this (a cover is already large, so it grows less). */
const MAX_SCALE = 1.3;
const MAX_SCALE_FRONT = 1.1;
/** Cards are tilted a degree or so, which makes them a little taller than their box. */
const TILT = 12;

/** The base sizes of the Kraft design; every one is scaled by `k`. */
export interface KraftSizes {
  k: number;
  headline: number;
  /** Line height of the headline in px (the accent phrase is set bigger on the same line). */
  headLine: number;
  /** The accent phrase's font size (a serif italic looks smaller than a condensed sans at the same size). */
  accent: number;
  /** The gap after a headline word. */
  wordGap: number;
  /** The tape label (the kicker): its text size and its height. */
  label: number;
  labelH: number;
  pillH: number;
  gap: number;
  cardPadX: number;
  cardPadTop: number;
  cardPadBottom: number;
  cardText: number;
  big: number;
  bigMb: number;
  cardGap: number;
  /** The terminal card: its paper frame, title bar, inner padding and text. */
  termFrame: number;
  termBar: number;
  termPad: number;
  termText: number;
  noteSize: number;
  noteH: number;
  sub: number;
  subMt: number;
  swipe: number;
  listNum: number;
  listText: number;
  listGap: number;
  coverKicker: number;
  coverSub: number;
}

export function kraftHeadlineBase(slide: Slide): number {
  const n = slide.headline.replace(/\s+/g, " ").length;
  if (slide.layout === "cover" || slide.layout === "statement") return n <= 24 ? 190 : n <= 40 ? 160 : n <= 60 ? 132 : 112;
  return n <= 22 ? 128 : n <= 40 ? 112 : n <= 60 ? 98 : 86;
}

export function kraftSizes(slide: Slide, k: number): KraftSizes {
  const r = (n: number) => Math.round(n * k);
  const headline = k === 1 ? kraftHeadlineBase(slide) : Math.max(40, Math.round(kraftHeadlineBase(slide) * k));
  return {
    k,
    headline,
    headLine: Math.round(headline * 1.04),
    accent: Math.round(headline * 1.1),
    wordGap: Math.round(headline * 0.2),
    label: r(50),
    labelH: r(88),
    pillH: 64,
    gap: r(30),
    cardPadX: r(42),
    cardPadTop: r(44),
    cardPadBottom: r(40),
    cardText: r(38),
    big: r(150),
    bigMb: r(10),
    cardGap: r(40),
    termFrame: r(20),
    termBar: r(56),
    termPad: r(34),
    termText: r(33),
    noteSize: r(46),
    noteH: r(88),
    sub: r(40),
    subMt: r(30),
    swipe: 64,
    listNum: r(84),
    listText: r(38),
    listGap: r(28),
    coverKicker: r(28),
    coverSub: r(44),
  };
}

const MONO_LINE = 1.32;
const TERM_LINE = 1.45;

/** How many rows the headline takes: words wrap as whole boxes, the accent phrase in the serif. */
export function headlineRows(slide: Slide, s: KraftSizes): number {
  let rows = 0;
  for (const words of splitHeadline(slide.headline, slide.accent)) {
    let n = 1;
    let line = 0;
    for (const w of words) {
      const item = w.accent
        ? textWidth("playfairBoldItalic", w.text, s.accent, 0) + (w.joined ? 0 : s.wordGap)
        : textWidth("anton", w.text, s.headline, 0) + (w.joined ? 0 : s.wordGap);
      if (line > 0 && line + item > INNER_W) {
        n += 1;
        line = item;
      } else line += item;
    }
    rows += n;
  }
  return rows;
}

/** An italic serif letter at the end of a word (a comma, a y) reaches a little past its advance; this much of the accent size. */
const ACCENT_OVERHANG = 0.05;

/**
 * The widest single headline word at these sizes. A word is never split, so one wider than the row runs off the
 * slide whatever the wrapping does (a long accent word in the big serif on a cover): the fit has to shrink until it fits.
 */
export function widestHeadlineWord(slide: Slide, s: KraftSizes): number {
  let widest = 0;
  for (const words of splitHeadline(slide.headline, slide.accent)) {
    for (const w of words) {
      const width = w.accent
        ? textWidth("playfairBoldItalic", w.text, s.accent, 0) + s.accent * ACCENT_OVERHANG
        : textWidth("anton", w.text, s.headline, 0);
      if (width > widest) widest = width;
    }
  }
  return widest;
}

/** A card is drawn as a terminal window when its tone is ink, otherwise as a paper card. */
export const isTerminal = (card: { tone: string }) => card.tone === "ink";

/** The box a key figure is drawn in (the hand-drawn circle is as big as the box): taller than the digits so it clears them. */
export function figureHeight(s: KraftSizes): number {
  return Math.round(s.big * 1.4);
}

function paperCardHeight(card: NonNullable<Slide["cards"]>[number], s: KraftSizes): number {
  const inner = INNER_W - 2 * s.cardPadX;
  const lines = wrapLines("dmSans", card.text, s.cardText, 0, inner);
  const label = card.label ? Math.round(24 * MONO_LINE) + 10 : 0;
  const big = card.big ? figureHeight(s) + s.bigMb : 0;
  return s.cardPadTop + s.cardPadBottom + label + big + lines * s.cardText * 1.32;
}

function terminalHeight(card: NonNullable<Slide["cards"]>[number], s: KraftSizes): number {
  const inner = INNER_W - 2 * s.termFrame - 2 * s.termPad;
  const lines = wrapLines("dmMono", card.text, s.termText, 0, inner);
  return 2 * s.termFrame + s.termBar + 2 * s.termPad + lines * s.termText * TERM_LINE;
}

function cardsHeight(slide: Slide, s: KraftSizes): number {
  const cards = slide.cards ?? [];
  if (cards.length === 0) return 0;
  const heights = cards.map((c) => (isTerminal(c) ? terminalHeight(c, s) : paperCardHeight(c, s)));
  return heights.reduce((a, b) => a + b, 0) + s.cardGap * (cards.length - 1) + TILT;
}

function listHeight(slide: Slide, s: KraftSizes): number {
  const items = slide.items ?? [];
  if (items.length === 0) return 0;
  const textW = INNER_W - 2 * s.cardPadX - s.listNum - 28;
  const rows = items.map((it) => {
    const lines = wrapLines("dmSansMedium", it.text, s.listText, 0, textW);
    const label = it.label ? Math.round(22 * MONO_LINE) + 6 : 0;
    return Math.max(s.listNum, label + lines * s.listText * 1.3);
  });
  return s.cardPadTop + s.cardPadBottom + rows.reduce((a, b) => a + b, 0) + s.listGap * (items.length - 1) + TILT;
}

function subHeight(slide: Slide, s: KraftSizes, size: number): number {
  if (!slide.sub) return 0;
  return wrapLines("dmSansItalic", slide.sub, size, 0, INNER_W) * size * 1.26;
}

/** The estimated height of everything on the slide (the paddings left out), at these sizes. */
export function kraftContentHeight(slide: Slide, s: KraftSizes, isLast: boolean): number {
  const head = headlineRows(slide, s) * s.headLine;
  const noteRow = slide.note ? s.noteH + 6 : 0;
  const swipe = isLast ? 0 : s.swipe + 20;
  switch (slide.layout) {
    case "cover":
    case "statement": {
      const kicker = slide.kicker ? s.coverKicker * 1.4 + s.gap : 0;
      const noteCard = slide.sub ? 2 * s.cardPadTop + wrapLines("dmSansItalic", slide.sub, s.coverSub, 0, INNER_W - 2 * s.cardPadX) * s.coverSub * 1.3 + 30 : 0;
      return s.pillH + s.gap + head + (kicker ? s.gap + kicker : 0) + noteRow + (noteCard ? s.gap * 2 + noteCard : 0) + swipe;
    }
    case "close": {
      const pills = s.labelH + 12;
      return Math.max(s.pillH, slide.kicker ? s.labelH : 0) + s.gap + head + (slide.sub ? s.subMt + subHeight(slide, s, s.sub) : 0) + s.gap * 2 + pills;
    }
    case "list":
      return Math.max(s.pillH, slide.kicker ? s.labelH : 0) + s.gap + head + noteRow + s.gap + listHeight(slide, s) + swipe;
    case "cards":
    default:
      return (
        Math.max(s.pillH, slide.kicker ? s.labelH : 0) + s.gap + head + noteRow + s.gap + cardsHeight(slide, s) + (slide.sub ? s.subMt + subHeight(slide, s, s.sub) : 0) + swipe
      );
  }
}

export interface KraftFit {
  /** 1 when the slide fits as designed; smaller when it was shrunk to fit. */
  k: number;
  sizes: KraftSizes;
  /** The estimated height of the content at this scale, and what it may use. */
  height: number;
  budget: number;
  /** False only when even the smallest scale does not fit. */
  fits: boolean;
}

/** The sizes to draw `slide` with: the largest scale where the height fits and no headline word is wider than the row, from 1.3 (a slide with room to spare) down to half size. */
export function fitKraft(slide: Slide, isLast = false): KraftFit {
  const budget = INNER_H - SAFETY;
  const top = slide.layout === "cover" || slide.layout === "statement" ? MAX_SCALE_FRONT : MAX_SCALE;
  const steps = Math.round((top - MIN_SCALE) / STEP);
  for (let i = 0; i <= steps; i += 1) {
    const k = Math.round((top - i * STEP) * 100) / 100;
    const sizes = kraftSizes(slide, k);
    const height = kraftContentHeight(slide, sizes, isLast);
    if (height <= budget && widestHeadlineWord(slide, sizes) <= INNER_W) return { k, sizes, height, budget, fits: true };
  }
  const sizes = kraftSizes(slide, MIN_SCALE);
  return { k: MIN_SCALE, sizes, height: kraftContentHeight(slide, sizes, isLast), budget, fits: widestHeadlineWord(slide, sizes) <= INNER_W && kraftContentHeight(slide, sizes, isLast) <= budget };
}
