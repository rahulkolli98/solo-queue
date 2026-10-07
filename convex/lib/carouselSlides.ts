import { z } from "zod";

/**
 * Carousel slides: the data a carousel is made of, shared by the drafting action (what the model writes), the
 * Studio editor (what the founder edits) and the image route (what is drawn). Pure and unit-tested; nothing here
 * draws anything. The look (colours, fonts) lives in src/lib/carouselPalette.ts and src/components/carousel.
 */

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1350;
/** A carousel is 1 to 10 slides. One slide is a single statement image; Instagram carousels hold 2 to 10 items. */
export const MIN_SLIDES = 1;
export const MAX_SLIDES = 10;

export const SLIDE_LAYOUTS = ["cover", "cards", "list", "close", "statement"] as const;
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number];

export const SLIDE_TONES = ["coral", "cream", "ink", "pink", "yellow", "blue"] as const;
export type SlideTone = (typeof SLIDE_TONES)[number];

export const LIMITS = {
  kicker: 40,
  headline: 90,
  accent: 40,
  sub: 140,
  cardLabel: 40,
  cardBig: 8,
  cardText: 160,
  itemText: 100,
  pill: 12,
  tag: 30,
} as const;

const text = (max: number) => z.string().trim().max(max);
/** A headline may carry line breaks: the founder's slides break where the meaning does. */
const headlineText = z
  .string()
  .max(LIMITS.headline)
  .transform((t) => t.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim())
  .pipe(z.string().min(1));

const cardSchema = z.object({
  label: text(LIMITS.cardLabel).optional(),
  /** A big figure ("60d", "500") shown above the text. Cards with one sit side by side. */
  big: text(LIMITS.cardBig).optional(),
  text: text(LIMITS.cardText).min(1),
  tone: z.enum(SLIDE_TONES),
});

const itemSchema = z.object({
  label: text(LIMITS.cardLabel).optional(),
  text: text(LIMITS.itemText).min(1),
});

export const slideSchema = z.object({
  layout: z.enum(SLIDE_LAYOUTS),
  tone: z.enum(SLIDE_TONES),
  kicker: text(LIMITS.kicker).optional(),
  headline: headlineText,
  /** The word or words of the headline drawn in the accent colour. */
  accent: text(LIMITS.accent).optional(),
  /** The italic line (under the cover headline, under the cards, under the close). */
  sub: text(LIMITS.sub).optional(),
  cards: z.array(cardSchema).max(3).optional(),
  items: z.array(itemSchema).max(5).optional(),
  pills: z.array(text(LIMITS.pill).min(1)).max(3).optional(),
  /** The small caps tag at the bottom right of a statement slide ("Build in public"). */
  tag: text(LIMITS.tag).optional(),
});

export type Slide = z.infer<typeof slideSchema>;
export type SlideCard = NonNullable<Slide["cards"]>[number];

export type SlideValidation = { ok: true; slide: Slide } | { ok: false; message: string };

/** One slide checked against the limits, with a message the founder can read. */
export function validateSlide(input: unknown): SlideValidation {
  const parsed = slideSchema.safeParse(input);
  if (parsed.success) return { ok: true, slide: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue.path.length ? ` (${issue.path.join(".")})` : "";
  return { ok: false, message: `${issue.message}${where}` };
}

export interface HeadlineWord {
  text: string;
  accent: boolean;
  /** No gap after this word: it ends in a hyphen and the next piece continues it ("cross-" then "posting."). */
  joined: boolean;
}

/**
 * The headline as lines of words, with the accent phrase marked. A line break in the headline starts a new line.
 * A hyphenated word is split after the hyphen so either half can carry the accent. The accent matches whole
 * pieces, ignoring case and the punctuation around them ("alive" marks "alive."), and only the first match of each phrase
 * is marked. Separate phrases with "|" to colour more than one part ("100|50.").
 */
export function splitHeadline(headline: string, accent?: string): HeadlineWord[][] {
  const plain = (w: string) => w.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  const lines = headline.split("\n").map((line) =>
    (line.match(/\S+?-(?=\S)|\S+/g) ?? []).map((text) => ({ text, accent: false, joined: text.endsWith("-") }))
  );
  const flat = lines.flat();
  // Several phrases can be coloured: separate them with "|" ("100|50." colours both numbers).
  for (const phrase of (accent ?? "").split("|")) {
    const target = phrase.split(/\s+/).filter(Boolean).flatMap((w) => w.match(/[^-]+-?/g) ?? []).map(plain).filter(Boolean);
    if (target.length === 0) continue;
    for (let i = 0; i + target.length <= flat.length; i += 1) {
      if (target.every((t, k) => plain(flat[i + k].text) === t)) {
        for (let k = 0; k < target.length; k += 1) flat[i + k].accent = true;
        break;
      }
    }
  }
  return lines;
}

/**
 * The headline size in pixels: a short cover line is shouted, a long one steps down so it stays within about
 * four lines on a 1080 px slide.
 */
export function headlineSize(layout: SlideLayout, headline: string): number {
  const n = headline.length;
  if (layout === "statement") return n <= 70 ? 124 : 108;
  if (layout === "cover") return n <= 22 ? 188 : n <= 40 ? 150 : n <= 60 ? 120 : 100;
  return n <= 24 ? 128 : n <= 44 ? 112 : n <= 64 ? 96 : 84;
}

/** "01/06" for slide `index` (0-based) of `total`. */
export function pageLabel(index: number, total: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(index + 1)}/${pad(total)}`;
}
