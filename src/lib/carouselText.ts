import { METRICS, type FontName } from "@/lib/carouselMetrics";

/**
 * Measuring text without drawing it: the width of a line and how many lines a box takes, from the real glyph widths of
 * the fonts (carouselMetrics.ts). Used by the slide fitters (carouselFit.ts, carouselKraftFit.ts).
 */

export function advance(font: FontName, ch: string): number {
  const m = METRICS[font];
  return (m.widths[ch] ?? m.fallback) / m.unitsPerEm;
}

/** The width of `text` on one line, in pixels, with the letter spacing the renderer applies after every character. */
export function textWidth(font: FontName, text: string, size: number, letterSpacing: number): number {
  let w = 0;
  for (const ch of text) w += advance(font, ch) * size + letterSpacing;
  return w;
}

/** How many lines `text` takes in a box `width` wide: words wrap at spaces, a new paragraph at a line break. */
export function wrapLines(font: FontName, text: string, size: number, letterSpacing: number, width: number): number {
  const space = advance(font, " ") * size + letterSpacing;
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines += 1;
      continue;
    }
    let n = 1;
    let line = 0;
    for (const word of words) {
      const w = textWidth(font, word, size, letterSpacing);
      if (line === 0) line = w;
      else if (line + space + w <= width) line += space + w;
      else {
        n += 1;
        line = w;
      }
    }
    lines += n;
  }
  return lines;
}
