/**
 * The Kraft zine theme's colours, read off the founder's reference screenshots (kraft paper, near-black ink, rust-red
 * accent, cream paper cards, a black terminal). The slide is drawn on the server, which cannot read CSS variables, so
 * they are written here, as the Solo Queue colours are in carouselPalette.ts.
 */
export const KRAFT = {
  /** The kraft paper the slide is printed on. */
  paper: "#cdb598",
  /** Headline and body ink. */
  ink: "#14110d",
  /** Softer ink for small labels. */
  muted: "#5c4c3a",
  /** The rust-red accent: the italic phrase, circles, notes. */
  red: "#c2432a",
  /** A paper card. */
  card: "#f3e9d6",
  cardShadow: "0 14px 28px rgba(54, 34, 12, 0.32)",
  /** The torn-tape label and the pills. */
  tapeBlack: "#17120d",
  tapeText: "#f7f1e4",
  /** A piece of masking tape holding a card down. */
  tape: "rgba(205, 196, 178, 0.82)",
  tapeEdge: "rgba(110, 96, 76, 0.38)",
  /** The terminal window. */
  terminal: "#15130f",
  terminalText: "#e9e2d2",
  terminalMuted: "#8f877a",
  terminalPrompt: "#e0634a",
  dotRed: "#e5584b",
  dotYellow: "#e8b53a",
  dotGreen: "#5dbb63",
  /** The slide counter pill. */
  pill: "rgba(20, 17, 13, 0.9)",
} as const;
