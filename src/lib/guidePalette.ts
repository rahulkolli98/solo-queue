/**
 * The Orange guide theme's colours, read off the founder's "Claude Code just got mods" reference slides: a warm cream
 * page, near-black condensed type, one bright orange accent, white boxes with a thin orange outline, a dark counter
 * pill and a pixel-window terminal. Written here because the slide is drawn on the server, which cannot read CSS variables.
 */
export const GUIDE = {
  bg: "#f7f0e6",
  bgDeep: "#efe6d8",
  ink: "#1b1210",
  muted: "#5b4a42",
  orange: "#ff4e14",
  white: "#ffffff",
  /** The round "1 / 9" counter. */
  pill: "#4a4a4c",
  pillText: "#ffffff",
  dotRed: "#e5584b",
  dotYellow: "#e8b53a",
  dotGreen: "#5dbb63",
  /** The dark list panel on the close slide, and its cream bars. */
  panel: "#1d1514",
  bar: "#f3ecdf",
} as const;
