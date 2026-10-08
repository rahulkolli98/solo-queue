import { z } from "zod";
import {
  LIMITS,
  MAX_SLIDES,
  SLIDE_LAYOUTS,
  SLIDE_TONES,
  validateSlide,
  type Slide,
  type SlideTone,
} from "./carouselSlides";

/**
 * Writing a carousel with the model: the instructions that go after the template, and a tolerant reader for the
 * JSON it sends back (caption plus slides). Models overshoot a limit now and then, so text is cut to the slide
 * limits before it is checked; a reply with too few usable slides is refused rather than half-saved.
 */

/** How many slides a run writes when nothing says otherwise (the founder's own carousels are 6 to 7). */
export const DEFAULT_SLIDE_COUNT = 6;
export const MIN_WRITTEN_SLIDES = 1;

/** Keep a requested slide count inside what is written (1 to 10; 1 is a single statement image). */
export function clampSlideCount(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return DEFAULT_SLIDE_COUNT;
  return Math.min(MAX_SLIDES, Math.max(MIN_WRITTEN_SLIDES, Math.round(n)));
}

/**
 * Said after the template so it wins over a template's "confession" tone. The research is the base and the model may
 * add its own well-established points, but what is stated must be accurate: attributed, whole, and never made up.
 */
const FACTS_ONLY =
  "Write about the subject itself, for someone who has not seen the source: the slides explain it, they do not review the article. Build them on the topic, notes and sources. " +
  "Name the source once (a slide or the caption). Attribute (\"the article says\") only a figure or claim you cannot stand behind yourself, not every card, and never put your own wording or points in a source's mouth. " +
  "Add your own explanation, context and useful points where they help the reader (what it is, why it matters, how to choose); they must be well established and correct, and accuracy matters more than adding something. " +
  "A specific figure, price, date, name or quote must come from the sources or be widely known and certain: never invent one, and when you are not sure, leave it out. " +
  "When a source gives a range, show both ends, never only the end that proves the point, and never set the top of one range against the bottom of another. " +
  "The story beats may describe a personal arc (what was wrong, what it cost, what changed). When the material is about something in the world instead, keep the order of ideas but make every beat about the subject, and never invent a before-and-after, a history, a hardship or a result that the sources do not state. " +
  "Never invent the founder's own experience (what they did, tried, felt, noticed or believed): a first-person line is allowed only when the notes say it.";

/** The JSON shape and the slide rules, appended to the template for the carousel call. */
export function carouselInstructions(input: { count: number; style?: string }): string {
  const lines = input.count === 1 ? singleSlideInstructions() : [
    `Write exactly ${input.count} slides, in order, plus one Instagram caption.`,
    'Reply with one JSON object and nothing else: {"caption": string, "slides": [slide, ...]}.',
    "A slide is: {layout, tone, kicker?, headline, accent?, sub?, cards?, items?, pills?}.",
    `layout is one of ${SLIDE_LAYOUTS.join(", ")}. The first slide is "cover" (a big headline and one italic line in sub). The last slide is "close" (a headline, an italic line in sub, and pills such as ["Follow","Save","Share"]). Slides between use "cards" (headline plus 1 to 3 cards) or "list" (headline plus 2 to 5 items).`,
    `tone is the slide colour, one of ${SLIDE_TONES.join(", ")}. Change colour from one slide to the next; do not use the same colour twice in a row.`,
    `kicker: a few capital-letter words naming the slide (at most ${LIMITS.kicker} characters), for example "THE PROBLEM". headline: at most ${LIMITS.headline} characters and about 6 words; use \\n to break a line where the meaning breaks. accent: the one word or short phrase of the headline to colour (separate two phrases with | to colour two parts, such as 100|50). sub: one italic sentence (at most ${LIMITS.sub} characters).`,
    `A card is {label?, big?, text, tone}: label is a short caps tag; big is an optional figure such as "60d" or "500" (at most ${LIMITS.cardBig} characters, and only when the figure comes from the sources or is certain); text is one or two short sentences (at most ${LIMITS.cardText} characters); tone is one of ${SLIDE_TONES.join(", ")} and should differ from the slide colour. Two cards that both have big sit side by side; otherwise cards stack.`,
    `An item is {label?, text}: text at most ${LIMITS.itemText} characters.`,
    FACTS_ONLY,
    "One idea per slide; the slides read as a story, not a list of tips. If the material is about something in the world rather than the founder's own build, tell it as an explainer (what it is, how it works, what could change); the story arc above is the order of the ideas, not a personal confession.",
    "caption: the Instagram caption in the founder's voice, under 2,200 characters, with the hashtag rule given above. It reads like a post a person wrote, not a summary of the notes: lead with the one idea, add a point or two the slides leave out, and do not list everything. It must stand alone and must not repeat the slides word for word.",
  ];
  if (input.style?.trim()) {
    lines.push(`Style and references for this carousel (follow the look and tone they describe):\n${input.style.trim()}`);
  }
  return lines.join("\n");
}

/** One slide is a single statement image: one bold line with an italic aside, no story to swipe through. */
function singleSlideInstructions(): string[] {
  return [
    "Write exactly 1 slide: one statement image, plus one Instagram caption.",
    'Reply with one JSON object and nothing else: {"caption": string, "slides": [slide]}.',
    'The slide is {layout: "statement", tone, kicker, headline, accent, sub, tag}.',
    `tone is the slide colour, one of ${SLIDE_TONES.join(", ")}.`,
    `kicker: a few capital-letter words naming the idea (at most ${LIMITS.kicker} characters), for example "FUN FACT" or "FROM MY BUILD LOG". headline: the one bold statement, at most ${LIMITS.headline} characters, a complete thought a stranger gets in two seconds. accent: the one word, number or short phrase of the headline to colour. sub: one italic sentence (at most ${LIMITS.sub} characters) with the dry aside. tag: a small caps label such as "Build in public" (at most ${LIMITS.tag} characters).`,
    FACTS_ONLY,
    "caption: the Instagram caption in the founder's voice, under 2,200 characters, with the hashtag rule given above. It adds the story the image leaves out; it does not repeat the headline.",
  ];
}

const rawSchema = z.object({
  caption: z.string().optional(),
  slides: z.array(z.record(z.string(), z.unknown())),
});

/** Models sometimes wrap a line in Markdown emphasis (*like this*); a slide shows plain text, so the marks go. */
function plainText(value: string): string {
  return value
    .replace(/\*\*|__/g, "")
    .replace(/(^|\s)[*_](\S[^*_\n]*?)[*_](?=\s|$|[.,;:!?])/g, "$1$2")
    .replace(/^[*_]+|[*_]+$/g, "");
}

function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = plainText(value).replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
  if (!t) return undefined;
  return t.length <= max ? t : t.slice(0, max).trimEnd();
}

function tone(value: unknown, fallback: SlideTone): SlideTone {
  return SLIDE_TONES.includes(value as SlideTone) ? (value as SlideTone) : fallback;
}

/** Colours to fall back on, in an order that never repeats a neighbour. */
const ROTATION: SlideTone[] = ["coral", "ink", "cream", "yellow", "blue", "pink"];

function normalizeSlide(raw: Record<string, unknown>, index: number, count: number): unknown {
  const layoutRaw = SLIDE_LAYOUTS.includes(raw.layout as never) ? (raw.layout as Slide["layout"]) : "cards";
  const layout: Slide["layout"] =
    count === 1
      ? "statement"
      : index === 0
        ? "cover"
        : layoutRaw === "statement"
          ? "cards"
          : index === count - 1 && layoutRaw === "cover"
            ? "close"
            : layoutRaw;
  const slideTone = tone(raw.tone, ROTATION[index % ROTATION.length]);
  const cards = Array.isArray(raw.cards)
    ? raw.cards
        .map((c) => {
          const card = (c ?? {}) as Record<string, unknown>;
          const text = clip(card.text, LIMITS.cardText);
          return text
            ? {
                label: clip(card.label, LIMITS.cardLabel),
                big: clip(card.big, LIMITS.cardBig),
                text,
                tone: tone(card.tone, slideTone === "cream" ? "ink" : "cream"),
              }
            : null;
        })
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .slice(0, 3)
    : undefined;
  const items = Array.isArray(raw.items)
    ? raw.items
        .map((it) => {
          const item = (it ?? {}) as Record<string, unknown>;
          const text = clip(item.text, LIMITS.itemText);
          return text ? { label: clip(item.label, LIMITS.cardLabel), text } : null;
        })
        .filter((i): i is NonNullable<typeof i> => i !== null)
        .slice(0, 5)
    : undefined;
  const pills = Array.isArray(raw.pills)
    ? raw.pills.map((p) => clip(p, LIMITS.pill)).filter((p): p is string => Boolean(p)).slice(0, 3)
    : undefined;
  return {
    layout,
    tone: slideTone,
    kicker: clip(raw.kicker, LIMITS.kicker),
    headline: clip(raw.headline, LIMITS.headline) ?? "",
    accent: clip(raw.accent, LIMITS.accent),
    sub: clip(raw.sub, LIMITS.sub),
    cards: cards?.length ? cards : undefined,
    items: items?.length ? items : undefined,
    // A close slide needs at least two asks to look right; a model that gave one gets the usual three.
    pills: layout === "close" ? (pills && pills.length >= 2 ? pills : ["Follow", "Save", "Share"]) : pills?.length ? pills : undefined,
    tag: layout === "statement" ? clip(raw.tag, LIMITS.tag) : undefined,
  };
}

function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return undefined;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** Drops undefined fields so a slide is stored without empty keys (Convex rejects `undefined` inside arrays of objects). */
function compact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface WrittenCarousel {
  caption: string;
  slides: Slide[];
}

/**
 * The model's reply as a carousel: a caption and 1 to 10 valid slides, or null when the reply holds no usable
 * carousel. The first slide is always the cover; a closing slide that came back as a cover becomes the close.
 * At most `count` slides are kept.
 */
export function parseCarousel(text: string, count: number): WrittenCarousel | null {
  const parsed = rawSchema.safeParse(extractJson(text));
  if (!parsed.success) return null;
  const wanted = clampSlideCount(count);
  const raw = parsed.data.slides.slice(0, wanted);
  const slides: Slide[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const checked = validateSlide(compact(normalizeSlide(raw[i], i, raw.length)));
    if (checked.ok) slides.push(checked.slide);
  }
  if (slides.length < MIN_WRITTEN_SLIDES) return null;
  const caption = (parsed.data.caption ?? "").replace(/\r\n?/g, "\n").trim();
  if (!caption) return null;
  return { caption, slides };
}
