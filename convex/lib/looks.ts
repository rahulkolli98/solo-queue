import { z } from "zod";
import { SLIDE_TONES, type Slide, type SlideLayout, type SlideTone } from "./carouselSlides";

/**
 * A carousel "look": how the founder wants a carousel to be designed, saved once and picked per run. It holds any
 * mix of three optional parts, so the founder can bring whichever they have:
 *  - a slide plan (the layout and colour of each slide, in order), usually saved from a carousel they made;
 *  - a design document (Markdown or plain words) describing the look;
 *  - up to six reference images of carousels they like.
 * A look never holds a slide count (the Slides setting does) or any facts (the topic does). The app can only draw its
 * own layouts and colours, so a look steers which of those are used and how the text reads; it cannot add new designs.
 */

export const PLAN_LAYOUTS = ["cover", "cards", "list", "close"] as const;
export type PlanLayout = (typeof PLAN_LAYOUTS)[number];
export interface PlanSlide {
  layout: PlanLayout;
  tone: SlideTone;
}

export const PLAN_MIN = 2;
export const PLAN_MAX = 10;
export const NAME_MAX = 60;
/** A design document is read in full by the model, so it is bounded (about 3,000 tokens). */
export const DESIGN_MAX = 12000;
export const REFERENCES_MAX = 6;
/** What the model can read as a reference image. */
export const REFERENCE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

const planSlideSchema = z.object({ layout: z.enum(PLAN_LAYOUTS), tone: z.enum(SLIDE_TONES) });

export interface LookInput {
  name: string;
  plan?: PlanSlide[];
  design?: string;
  referenceIds?: string[];
}

export type LookValidation = { ok: true; look: LookInput } | { ok: false; message: string };

/** A look checked for the founder: a name, at least one part, and every part within its limits. */
export function validateLook(input: LookInput): LookValidation {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, message: "Give the look a name." };
  if (name.length > NAME_MAX) return { ok: false, message: `Keep the name under ${NAME_MAX} characters.` };

  let plan: PlanSlide[] | undefined;
  if (input.plan !== undefined && input.plan.length > 0) {
    if (input.plan.length < PLAN_MIN || input.plan.length > PLAN_MAX) {
      return { ok: false, message: `A slide plan has ${PLAN_MIN} to ${PLAN_MAX} slides. This one has ${input.plan.length}.` };
    }
    const parsed = z.array(planSlideSchema).safeParse(input.plan);
    if (!parsed.success) return { ok: false, message: "Each slide in the plan needs a layout and a colour the app can draw." };
    plan = parsed.data;
  }

  const design = input.design?.replace(/\r\n?/g, "\n").trim() || undefined;
  if (design && design.length > DESIGN_MAX) {
    return { ok: false, message: `The design document is over ${DESIGN_MAX.toLocaleString("en-GB")} characters. Trim it to what matters for the look.` };
  }

  const referenceIds = input.referenceIds && input.referenceIds.length > 0 ? input.referenceIds : undefined;
  if (referenceIds) {
    if (referenceIds.length > REFERENCES_MAX) return { ok: false, message: `A look holds ${REFERENCES_MAX} reference images at most.` };
    if (new Set(referenceIds).size !== referenceIds.length) return { ok: false, message: "The same image is in the look twice." };
  }

  if (!plan && !design && !referenceIds) {
    return { ok: false, message: "A look needs at least one thing: a slide plan, a design document or reference images." };
  }
  return { ok: true, look: { name, plan, design, referenceIds } };
}

/** "Calm explainer" becomes "calm-explainer"; empty or symbol-only names become "look". */
export function slugKey(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "look";
}

/** The first free key for a name: `calm-explainer`, then `calm-explainer-2`, `-3`... */
export function uniqueKey(name: string, taken: ReadonlySet<string>): string {
  const base = slugKey(name);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const key = `${base}-${n}`;
    if (!taken.has(key)) return key;
  }
  return `${base}-${Date.now()}`;
}

/**
 * The plan of a carousel the founder made: each slide's layout and colour, in order. A single statement slide has no
 * plan (a plan needs a cover and a close). Placeholder slides of a carousel made of the founder's own images are
 * never passed here.
 */
export function planFromSlides(slides: readonly Pick<Slide, "layout" | "tone">[]): PlanSlide[] | null {
  if (slides.length < PLAN_MIN) return null;
  const plan: PlanSlide[] = slides.slice(0, PLAN_MAX).map((s, i, all) => ({
    layout: planLayout(s.layout, i, all.length),
    tone: s.tone,
  }));
  return plan;
}

function planLayout(layout: SlideLayout, index: number, count: number): PlanLayout {
  if (index === 0) return "cover";
  if (index === count - 1) return "close";
  return layout === "list" ? "list" : "cards";
}

/** The tones the model may rotate through when a plan has no middle slides. */
const FILL_TONES: SlideTone[] = ["ink", "cream", "yellow", "blue", "pink", "coral"];

/**
 * A plan stretched or squeezed to `count` slides: the first slide keeps the plan's cover, the last keeps its close,
 * and the slides between cycle through the plan's middle slides in order. One slide (a statement) has no plan.
 */
export function planForCount(plan: readonly PlanSlide[], count: number): PlanSlide[] | null {
  if (count < 2 || plan.length < PLAN_MIN) return null;
  const middle = plan.slice(1, -1);
  const out: PlanSlide[] = [plan[0]];
  for (let i = 1; i < count - 1; i += 1) {
    out.push(middle.length > 0 ? middle[(i - 1) % middle.length] : { layout: "cards", tone: FILL_TONES[(i - 1) % FILL_TONES.length] });
  }
  out.push(plan[plan.length - 1]);
  return out;
}

/** Whether a media type can be sent to the model as a reference image. */
export function isReferenceType(mimeType: string): boolean {
  return (REFERENCE_TYPES as readonly string[]).includes(mimeType.toLowerCase());
}
