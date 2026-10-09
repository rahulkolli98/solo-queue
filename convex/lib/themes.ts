/**
 * Carousel themes: the design a carousel is drawn in. A theme is a named design system the slide renderer implements
 * (src/components/carousel): its colours, fonts, background and how labels, cards and notes look. The founder picks
 * one per carousel (or a look carries one); "Solo Queue" is the default and is the design every earlier carousel
 * was drawn in. This file is the list the app, the prompt and the database share; the drawing lives in the renderer.
 */

export const THEMES = [
  {
    key: "solo-queue",
    name: "Solo Queue",
    blurb: "The app's own design: warm colour blocks, a bold grotesque headline and an italic aside.",
    /** Whether the theme draws a slide's hand-written note. */
    notes: false,
  },
  {
    key: "kraft-zine",
    name: "Kraft zine",
    blurb: "A printed zine on kraft paper: torn-tape labels, heavy condensed headlines, a red italic accent, paper cards, terminal windows and hand-written notes.",
    notes: true,
  },
] as const;

export type ThemeKey = (typeof THEMES)[number]["key"];

export const DEFAULT_THEME: ThemeKey = "solo-queue";

export const THEME_KEYS: readonly ThemeKey[] = THEMES.map((t) => t.key);

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === "string" && (THEME_KEYS as readonly string[]).includes(value);
}

/** The theme a stored key means: a missing or unknown key is the default (an old or removed theme still draws). */
export function themeOf(key: string | undefined | null): ThemeKey {
  return isThemeKey(key) ? key : DEFAULT_THEME;
}

export function themeName(key: string | undefined | null): string {
  return THEMES.find((t) => t.key === themeOf(key))!.name;
}

/** Whether the theme draws a slide's hand-written `note`. */
export function themeShowsNotes(key: string | undefined | null): boolean {
  return THEMES.find((t) => t.key === themeOf(key))!.notes;
}
