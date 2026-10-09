/**
 * The carousel-look editor's draft and rules (Library > Carousel looks). Pure, so every rule is unit tested; the
 * component only wires it to Convex and to React state. A look holds any mix of a slide plan, a design document and
 * reference images (at least one). The limits come from convex/lib/looks.ts, which the server checks again.
 */
import type { SlideTone } from "../../convex/lib/carouselSlides";
import {
  DESIGN_MAX,
  NAME_MAX,
  PLAN_MAX,
  PLAN_MIN,
  REFERENCES_MAX,
  REFERENCE_MAX_BYTES,
  isReferenceType,
  type PlanLayout,
  type PlanSlide,
} from "../../convex/lib/looks";

export { DESIGN_MAX, NAME_MAX, PLAN_MAX, PLAN_MIN, REFERENCES_MAX, REFERENCE_MAX_BYTES };


export const PLAN_TONES: readonly SlideTone[] = ["coral", "cream", "ink", "pink", "yellow", "blue"];
/** The tones a "Add slide" cycles through, so new middle slides are not all the same colour. */
const ADD_TONES: readonly SlideTone[] = ["cream", "yellow", "blue", "pink", "coral", "ink"];

export const LAYOUT_LABELS: Record<PlanLayout, string> = {
  cover: "Cover",
  cards: "Cards",
  list: "List",
  close: "Close",
};
export const TONE_LABELS: Record<SlideTone, string> = {
  coral: "Coral",
  cream: "Cream",
  ink: "Ink",
  pink: "Pink",
  yellow: "Yellow",
  blue: "Blue",
};

/** The editor's working copy of a look. `key` is null for a look that is not saved yet. */
export interface LookDraft {
  key: string | null;
  name: string;
  /** null when the look has no slide plan. */
  plan: PlanSlide[] | null;
  design: string;
  /** Library media ids, in the order they were added. */
  referenceIds: string[];
}

/** The parts of a saved look the editor and the cards read (a row of api.looks.list). */
export interface LookLike {
  key: string;
  name: string;
  plan?: readonly PlanSlide[];
  design?: string;
  referenceIds?: readonly string[];
  usedCount: number;
}

export function emptyDraft(): LookDraft {
  return { key: null, name: "", plan: null, design: "", referenceIds: [] };
}

export function draftFromLook(look: LookLike): LookDraft {
  return {
    key: look.key,
    name: look.name,
    plan: look.plan && look.plan.length > 0 ? look.plan.map((s) => ({ ...s })) : null,
    design: look.design ?? "",
    referenceIds: [...(look.referenceIds ?? [])],
  };
}

// ---------- the slide plan ----------

/** The first slide is always the cover, the last always the close, the ones between cards or a list. */
export function normalizePlan(plan: readonly PlanSlide[]): PlanSlide[] {
  return plan.map((s, i, all) => {
    if (i === 0) return { ...s, layout: "cover" };
    if (i === all.length - 1) return { ...s, layout: "close" };
    return { ...s, layout: s.layout === "list" ? "list" : "cards" };
  });
}

/** A plan to start from: a cover, one cards slide and a close. */
export function defaultPlan(): PlanSlide[] {
  return [
    { layout: "cover", tone: "coral" },
    { layout: "cards", tone: "cream" },
    { layout: "close", tone: "ink" },
  ];
}

export function startPlan(draft: LookDraft): LookDraft {
  return draft.plan ? draft : { ...draft, plan: defaultPlan() };
}

export function removePlan(draft: LookDraft): LookDraft {
  return { ...draft, plan: null };
}

export function canAddPlanSlide(draft: LookDraft): boolean {
  return draft.plan !== null && draft.plan.length < PLAN_MAX;
}

/** Whether slide `index` can be removed: a middle slide, and the plan stays at two slides or more. */
export function canRemovePlanSlide(draft: LookDraft, index: number): boolean {
  const plan = draft.plan;
  return plan !== null && plan.length > PLAN_MIN && index > 0 && index < plan.length - 1;
}

/** A new "cards" slide before the final close (unchanged at ten slides). */
export function addPlanSlide(draft: LookDraft): LookDraft {
  if (!draft.plan || draft.plan.length >= PLAN_MAX) return draft;
  const middleCount = Math.max(0, draft.plan.length - 2);
  const added: PlanSlide = { layout: "cards", tone: ADD_TONES[middleCount % ADD_TONES.length] };
  return { ...draft, plan: [...draft.plan.slice(0, -1), added, draft.plan[draft.plan.length - 1]] };
}

export function removePlanSlide(draft: LookDraft, index: number): LookDraft {
  if (!draft.plan || !canRemovePlanSlide(draft, index)) return draft;
  return { ...draft, plan: draft.plan.filter((_, i) => i !== index) };
}

/** Whether middle slide `index` can move one place (-1 up, +1 down). The cover and the close never move. */
export function canMovePlanSlide(draft: LookDraft, index: number, direction: -1 | 1): boolean {
  const plan = draft.plan;
  const to = index + direction;
  return plan !== null && index > 0 && index < plan.length - 1 && to > 0 && to < plan.length - 1;
}

export function movePlanSlide(draft: LookDraft, index: number, direction: -1 | 1): LookDraft {
  if (!draft.plan || !canMovePlanSlide(draft, index, direction)) return draft;
  const next = [...draft.plan];
  const to = index + direction;
  [next[index], next[to]] = [next[to], next[index]];
  return { ...draft, plan: next };
}

/** The layouts slide `index` may have: the cover and the close are fixed, the middle ones are cards or a list. */
export function layoutChoices(index: number, count: number): PlanLayout[] {
  if (index === 0) return ["cover"];
  if (index === count - 1) return ["close"];
  return ["cards", "list"];
}

export function setPlanLayout(draft: LookDraft, index: number, layout: PlanLayout): LookDraft {
  if (!draft.plan || index < 0 || index >= draft.plan.length) return draft;
  if (!layoutChoices(index, draft.plan.length).includes(layout)) return draft;
  return { ...draft, plan: draft.plan.map((s, i) => (i === index ? { ...s, layout } : s)) };
}

export function setPlanTone(draft: LookDraft, index: number, tone: SlideTone): LookDraft {
  if (!draft.plan || index < 0 || index >= draft.plan.length) return draft;
  if (!PLAN_TONES.includes(tone)) return draft;
  return { ...draft, plan: draft.plan.map((s, i) => (i === index ? { ...s, tone } : s)) };
}

// ---------- the design document ----------

/** The length of a design document as the server counts it (line endings unified, ends trimmed). */
export function designLength(design: string): number {
  return design.replace(/\r\n?/g, "\n").trim().length;
}

/** "430 / 12,000". */
export function designCount(design: string): string {
  return `${designLength(design).toLocaleString("en-GB")} / ${DESIGN_MAX.toLocaleString("en-GB")}`;
}

const TEXT_EXTENSIONS = [".md", ".markdown", ".txt"];
const TEXT_TYPES = ["text/markdown", "text/x-markdown", "text/plain", ""];

/**
 * Why a file cannot be read as the design document, judged before it is read (type and size), or null. A browser
 * reports "" or "text/markdown" for .md files, so the extension decides when the type is not informative.
 */
export function designFileProblem(file: { name: string; type: string; size: number }): string | null {
  const name = file.name.toLowerCase();
  const textName = TEXT_EXTENSIONS.some((ext) => name.endsWith(ext));
  const textType = TEXT_TYPES.includes(file.type.toLowerCase());
  if (!textName || !textType) return `${file.name}: only a Markdown (.md) or plain text (.txt) file can be the design document.`;
  // A character is at most four bytes, so a file this big cannot fit; this avoids reading a huge file.
  if (file.size > DESIGN_MAX * 4) return `${file.name}: that file is too long. A design document is ${DESIGN_MAX.toLocaleString("en-GB")} characters at most.`;
  return null;
}

/** Why the text read from a file cannot be the design document, or null. */
export function designTextProblem(fileName: string, text: string): string | null {
  if (text.includes("\u0000")) return `${fileName}: that does not look like a text file.`;
  const length = designLength(text);
  if (length === 0) return `${fileName}: that file is empty.`;
  if (length > DESIGN_MAX) {
    return `${fileName}: that file has ${length.toLocaleString("en-GB")} characters. A design document is ${DESIGN_MAX.toLocaleString("en-GB")} at most, so trim it to what matters for the look.`;
  }
  return null;
}

// ---------- reference images ----------

/** Why a file cannot be a reference image, or null. */
export function referenceFileProblem(file: { name: string; type: string; size: number }): string | null {
  if (!isReferenceType(file.type)) return `${file.name}: only PNG, JPEG or WebP images can be reference images.`;
  if (file.size > REFERENCE_MAX_BYTES) return `${file.name}: too big (5 MB is the most for a reference image).`;
  return null;
}

/** Sort chosen files into those that can be uploaded (up to `room`) and sentences naming the ones refused. */
export function pickReferenceFiles<F extends { name: string; type: string; size: number }>(
  files: readonly F[],
  room: number
): { accepted: F[]; refused: string[] } {
  const accepted: F[] = [];
  const refused: string[] = [];
  let space = Math.max(0, room);
  for (const file of files) {
    const why = referenceFileProblem(file);
    if (why) refused.push(why);
    else if (space <= 0) refused.push(`${file.name}: a look holds ${REFERENCES_MAX} reference images at most.`);
    else {
      accepted.push(file);
      space -= 1;
    }
  }
  return { accepted, refused };
}

export function removeReference(draft: LookDraft, id: string): LookDraft {
  return { ...draft, referenceIds: draft.referenceIds.filter((r) => r !== id) };
}

/** Add uploaded images (a repeated id is kept once, and the list stops at six). */
export function addReferences(draft: LookDraft, ids: readonly string[]): LookDraft {
  const next = [...draft.referenceIds];
  for (const id of ids) if (!next.includes(id) && next.length < REFERENCES_MAX) next.push(id);
  return { ...draft, referenceIds: next };
}

// ---------- saving ----------

/** Everything wrong with the draft, as sentences for the founder (empty when it can be saved). */
export function lookProblems(draft: LookDraft): string[] {
  const problems: string[] = [];
  const name = draft.name.trim().replace(/\s+/g, " ");
  if (!name) problems.push("Give the look a name.");
  else if (name.length > NAME_MAX) problems.push(`Keep the name under ${NAME_MAX} characters.`);

  if (draft.plan !== null && (draft.plan.length < PLAN_MIN || draft.plan.length > PLAN_MAX)) {
    problems.push(`A slide plan has ${PLAN_MIN} to ${PLAN_MAX} slides. This one has ${draft.plan.length}.`);
  }
  if (designLength(draft.design) > DESIGN_MAX) {
    problems.push(`The design document is over ${DESIGN_MAX.toLocaleString("en-GB")} characters. Trim it to what matters for the look.`);
  }
  if (draft.referenceIds.length > REFERENCES_MAX) problems.push(`A look holds ${REFERENCES_MAX} reference images at most.`);

  const hasPart = draft.plan !== null || designLength(draft.design) > 0 || draft.referenceIds.length > 0;
  if (!hasPart) problems.push("A look needs at least one thing: a slide plan, a design document or reference images.");
  return problems;
}

export function canSave(draft: LookDraft): boolean {
  return lookProblems(draft).length === 0;
}

export interface LookSaveArgs {
  /** Present when editing; absent when creating. */
  key?: string;
  name: string;
  plan?: PlanSlide[];
  design?: string;
  referenceIds?: string[];
}

/** The arguments of api.looks.save: empty parts are left out, which clears them on an edit. */
export function lookSaveArgs(draft: LookDraft): LookSaveArgs {
  const design = draft.design.replace(/\r\n?/g, "\n").trim();
  return {
    ...(draft.key !== null ? { key: draft.key } : {}),
    name: draft.name.trim().replace(/\s+/g, " "),
    ...(draft.plan !== null ? { plan: normalizePlan(draft.plan) } : {}),
    ...(design ? { design } : {}),
    ...(draft.referenceIds.length > 0 ? { referenceIds: [...draft.referenceIds] } : {}),
  };
}

// ---------- the cards ----------

/** The start of a design document for a card: Markdown marks and line breaks flattened, cut at a word. */
export function designExcerpt(design: string, max = 140): string {
  const flat = design
    .replace(/^[#>\-*\s]+/gm, "")
    .replace(/[*_`]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, "")}…`;
}

/** The chips on a look's card: which parts it has, and how often it has been used. */
export function partsSummary(look: Pick<LookLike, "plan" | "design" | "referenceIds" | "usedCount">): string[] {
  const chips: string[] = [];
  const slides = look.plan?.length ?? 0;
  if (slides > 0) chips.push(`PLAN · ${slides} ${slides === 1 ? "SLIDE" : "SLIDES"}`);
  if (look.design && look.design.trim().length > 0) chips.push("DESIGN DOC");
  const refs = look.referenceIds?.length ?? 0;
  if (refs > 0) chips.push(`${refs} ${refs === 1 ? "REFERENCE" : "REFERENCES"}`);
  chips.push(`USED ${look.usedCount}×`);
  return chips;
}
