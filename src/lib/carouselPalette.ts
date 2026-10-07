import type { SlideTone } from "../../convex/lib/carouselSlides";

/**
 * The carousel's colours. The slide image is drawn on the server, which cannot read CSS variables, so the
 * Espresso Collage values are written here; `carouselPalette.test.ts` checks every one against
 * src/styles/tokens.css so the two cannot drift apart.
 */
export const PALETTE = {
  ink: "#2b1a14",
  cream: "#f4ebd9",
  coral: "#f0775c",
  red: "#c8412b",
  yellow: "#ffd54a",
  blue: "#8fb3da",
  pink: "#eba3d0",
} as const;

/** The token each palette value comes from (checked against tokens.css). */
export const PALETTE_TOKENS: Record<keyof typeof PALETTE, string> = {
  ink: "--color-on-surface",
  cream: "--color-surface",
  coral: "--color-pillar-build",
  red: "--color-primary",
  yellow: "--color-pillar-craft",
  blue: "--color-pillar-tools",
  pink: "--color-pillar-screen",
};

export interface ToneColors {
  bg: string;
  /** Headline and body text. */
  text: string;
  /** The accent words of the headline. */
  accent: string;
  /** The small mono line at the top left. */
  kicker: string;
}

/** What each slide colour looks like, read off the founder's own slides. */
export const SLIDE_COLORS: Record<SlideTone, ToneColors> = {
  coral: { bg: PALETTE.coral, text: PALETTE.cream, accent: PALETTE.ink, kicker: PALETTE.ink },
  cream: { bg: PALETTE.cream, text: PALETTE.ink, accent: PALETTE.red, kicker: PALETTE.red },
  ink: { bg: PALETTE.ink, text: PALETTE.cream, accent: PALETTE.coral, kicker: PALETTE.yellow },
  pink: { bg: PALETTE.pink, text: PALETTE.ink, accent: PALETTE.red, kicker: PALETTE.ink },
  yellow: { bg: PALETTE.yellow, text: PALETTE.ink, accent: PALETTE.red, kicker: PALETTE.red },
  // Red on blue is too faint at kicker size, so the small line is ink; the big accent words stay red.
  blue: { bg: PALETTE.blue, text: PALETTE.ink, accent: PALETTE.red, kicker: PALETTE.ink },
};

export interface CardColors {
  bg: string;
  label: string;
  text: string;
  big: string;
}

/** The colours of a card sitting on a slide. */
export const CARD_COLORS: Record<SlideTone, CardColors> = {
  ink: { bg: PALETTE.ink, label: PALETTE.yellow, text: PALETTE.cream, big: PALETTE.cream },
  cream: { bg: PALETTE.cream, label: PALETTE.red, text: PALETTE.ink, big: PALETTE.red },
  coral: { bg: PALETTE.coral, label: PALETTE.ink, text: PALETTE.ink, big: PALETTE.ink },
  yellow: { bg: PALETTE.yellow, label: PALETTE.ink, text: PALETTE.ink, big: PALETTE.ink },
  blue: { bg: PALETTE.blue, label: PALETTE.ink, text: PALETTE.ink, big: PALETTE.ink },
  pink: { bg: PALETTE.pink, label: PALETTE.ink, text: PALETTE.ink, big: PALETTE.ink },
};

/** The card shadow, soft and warm like the founder's slides. */
export const CARD_SHADOW = "0 26px 44px rgba(43, 26, 20, 0.22)";
