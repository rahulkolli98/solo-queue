import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SLIDE_TONES } from "../../convex/lib/carouselSlides";
import { CARD_COLORS, PALETTE, PALETTE_TOKENS, SLIDE_COLORS } from "@/lib/carouselPalette";

const tokens = readFileSync(resolve(import.meta.dirname, "../styles/tokens.css"), "utf8");
const tokenValue = (name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens)?.[1].toLowerCase();

describe("carousel colours", () => {
  it("every palette colour is the value of its Espresso Collage token", () => {
    for (const [key, token] of Object.entries(PALETTE_TOKENS)) {
      expect(tokenValue(token), `${key} -> ${token}`).toBe(PALETTE[key as keyof typeof PALETTE]);
    }
  });

  it("every slide colour and card colour is defined and drawn from the palette", () => {
    const allowed = new Set<string>(Object.values(PALETTE));
    for (const tone of SLIDE_TONES) {
      for (const value of Object.values(SLIDE_COLORS[tone])) expect(allowed.has(value), `slide ${tone}`).toBe(true);
      for (const value of Object.values(CARD_COLORS[tone])) expect(allowed.has(value), `card ${tone}`).toBe(true);
    }
  });

  it("text stays readable: card text 4.5, the small kicker 3.4, and the 100 px+ headline words 2.2", () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const tone of SLIDE_TONES) {
      // The founder's own pairings (cream on coral, red on blue) are bold display type, so they are held to 2.2.
      expect(ratio(SLIDE_COLORS[tone].bg, SLIDE_COLORS[tone].text), `${tone} headline`).toBeGreaterThanOrEqual(2.2);
      expect(ratio(SLIDE_COLORS[tone].bg, SLIDE_COLORS[tone].accent), `${tone} accent`).toBeGreaterThanOrEqual(2.2);
      expect(ratio(SLIDE_COLORS[tone].bg, SLIDE_COLORS[tone].kicker), `${tone} kicker`).toBeGreaterThanOrEqual(3.4);
      expect(ratio(CARD_COLORS[tone].bg, CARD_COLORS[tone].text), `${tone} card text`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(CARD_COLORS[tone].bg, CARD_COLORS[tone].label), `${tone} card label`).toBeGreaterThanOrEqual(4);
    }
  });

  it("the fonts a slide is drawn in are committed with their licence note", () => {
    for (const f of ["BricolageGrotesque-ExtraBold.woff", "DMSans-Regular.woff", "DMSans-Medium.woff", "DMSans-Italic.woff", "DMMono-Medium.woff"]) {
      expect(existsSync(resolve(import.meta.dirname, "../../assets/fonts", f)), f).toBe(true);
    }
    expect(existsSync(resolve(import.meta.dirname, "../../assets/fonts/LICENSE.md"))).toBe(true);
  });
});
