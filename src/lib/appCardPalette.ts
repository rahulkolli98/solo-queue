import type { SlideTone } from "../../convex/lib/carouselSlides";

/**
 * The App card theme's colours, read off the founder's reference screenshots (a very light cool grey page, white
 * rounded cards, near-black type, muted grey descriptions and one blue accent). The slide is drawn on the server, which
 * cannot read CSS variables, so they are written here, as the Kraft ones are in kraftPalette.ts.
 */
export interface AppCardColors {
  bg: string;
  /** Headline and body ink. */
  ink: string;
  /** Descriptions and notes. */
  muted: string;
  /** The one accent: the topic tag, the badge, the accent words. */
  blue: string;
  /** A pill, a row or a card. */
  card: string;
  cardShadow: string;
  /** The big pale number behind the top right corner. */
  ghost: string;
  /** Text on the blue badge and the solid pill. */
  onBlue: string;
}

const LIGHT: AppCardColors = {
  bg: "#f5f5f7",
  ink: "#1d1d1f",
  muted: "#6e6e73",
  blue: "#0071e3",
  card: "#ffffff",
  cardShadow: "0 2px 10px rgba(0, 0, 0, 0.06)",
  ghost: "#e8e8ed",
  onBlue: "#ffffff",
};

const DARK: AppCardColors = {
  bg: "#1d1d1f",
  ink: "#f5f5f7",
  muted: "#a1a1a6",
  blue: "#4da3ff",
  card: "#2c2c2e",
  cardShadow: "0 2px 10px rgba(0, 0, 0, 0.35)",
  ghost: "#2a2a2d",
  onBlue: "#0b1b2e",
};

const BLUE: AppCardColors = {
  bg: "#0071e3",
  ink: "#ffffff",
  muted: "rgba(255, 255, 255, 0.82)",
  blue: "#cfe4ff",
  card: "rgba(255, 255, 255, 0.18)",
  cardShadow: "none",
  ghost: "rgba(255, 255, 255, 0.14)",
  onBlue: "#0071e3",
};

/** The slide colour (tone) picks light, dark or blue: ink is dark, blue is blue, every other tone is the light page. */
export function appCardColors(tone: SlideTone): AppCardColors {
  if (tone === "ink") return DARK;
  if (tone === "blue") return BLUE;
  return LIGHT;
}
