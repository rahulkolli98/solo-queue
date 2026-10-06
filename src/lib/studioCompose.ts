/**
 * Pure helpers for how a thread is made in Studio: how many posts to ask the
 * model for, how Studio is entered (`?draft=1`, `?write=1`, `?from=research`),
 * and the wording of the "this replaces what you have" question. Kept out of
 * the components so each rule is unit tested.
 */
import { MAX_THREAD_POSTS, addPost, movePost, parseThread, removePost, serializeThread } from "@/lib/draftText";
import { KIND_META, generateFormatOf, type DraftKind, type GenerateFormat } from "@/lib/studioModel";

/** The fewest and most posts the model may be asked for (matches `drafting.generate`). */
export const POSTS_MIN = 2;
export const POSTS_MAX = 12;
/** Shown when the story frame's step count is not known yet. */
export const POSTS_FALLBACK = 4;

/** Keep a post count inside what the backend accepts; a non-number becomes the fallback. */
export function clampPosts(n: number): number {
  if (!Number.isFinite(n)) return POSTS_FALLBACK;
  return Math.min(POSTS_MAX, Math.max(POSTS_MIN, Math.round(n)));
}

/** The count the "Posts" control shows when the founder has not touched it: the frame's steps. */
export function defaultPostCount(frameSteps: number | undefined): number {
  return clampPosts(frameSteps && frameSteps > 0 ? frameSteps : POSTS_FALLBACK);
}

/**
 * What to send as `postCount`. Only a count the founder changed is sent; no
 * pick, or a pick back at the default, means "let the story frame decide".
 */
export function postCountToSend(chosen: number | null, frameDefault: number): number | undefined {
  if (chosen === null) return undefined;
  const value = clampPosts(chosen);
  return value === frameDefault ? undefined : value;
}

/** The "N / 25 posts" label beside a thread. */
export function postsLabel(count: number): string {
  return `${count} / ${MAX_THREAD_POSTS} posts`;
}

/** Said aloud when Remove waits for its second press on a post that has text ("" the rest of the time). */
export function removeConfirmText(postNumber: number, confirming: boolean): string {
  return confirming ? `Press Remove again to delete post ${postNumber}. Moving off this button keeps it.` : "";
}

/** The one-line explanation under the Posts control. */
export function postsHelper(frameSteps: number | undefined, savedDefault?: number): string {
  if (savedDefault !== undefined) return `Your default is ${savedDefault} posts. Pick another for this run only.`;
  return `A story frame has ${frameSteps && frameSteps > 0 ? frameSteps : POSTS_FALLBACK} steps; more posts stretch them.`;
}

/** The saved default thread length from settings, or undefined when the story frame decides (unset or 0). */
export function savedPostCount(value: number | undefined | null): number | undefined {
  return typeof value === "number" && value >= POSTS_MIN ? clampPosts(value) : undefined;
}

export interface GenerateArgs {
  topicId: string;
  formats: GenerateFormat[];
  frameKey?: string;
  postCount?: number;
}

/** The arguments for `drafting.generate`; `postCount` only travels with a thread and only when set. */
export function generateArgs(input: {
  topicId: string;
  kinds: DraftKind[];
  frameKey?: string;
  postCount?: number;
}): GenerateArgs {
  const args: GenerateArgs = {
    topicId: input.topicId,
    formats: input.kinds.map(generateFormatOf),
    frameKey: input.frameKey,
  };
  if (input.postCount !== undefined && input.kinds.includes("threads")) args.postCount = clampPosts(input.postCount);
  return args;
}

/** What Studio does on arrival, from its query string and what the topic already has. */
export interface StudioEntry {
  /** Open the Threads column straight into the writer (`?write=1`). */
  write: boolean;
  /** Write the first batch with the model (`?draft=1`, and only for a topic with no drafts). */
  generate: boolean;
}

/**
 * Only `?draft=1` ever starts the model, and only when the topic has no drafts
 * yet. `?write=1` and `?from=research` never do.
 */
export function studioEntry(params: { get: (name: string) => string | null }, draftCount: number): StudioEntry {
  return {
    write: params.get("write") === "1",
    generate: params.get("draft") === "1" && draftCount === 0,
  };
}

function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The question asked before Generate / Regenerate / Retry replaces drafts the founder already has. */
export function replaceQuestion(existing: DraftKind[]): string {
  if (existing.length === 0) return "";
  if (existing.length === 1) {
    const noun = KIND_META[existing[0]].noun;
    return `This replaces the ${noun} you have written. Replace it?`;
  }
  return `This replaces the ${listNames(existing.map((k) => KIND_META[k].noun))} you have. Replace them?`;
}

/**
 * The kinds this run would overwrite: those requested that already have a
 * draft, plus a thread still being typed in the writer.
 */
export function kindsAtRisk(
  requested: DraftKind[],
  have: Partial<Record<DraftKind, unknown>>,
  typingThread: boolean
): DraftKind[] {
  return requested.filter((k) => Boolean(have[k]) || (k === "threads" && typingThread));
}

/** The stored thread text with an empty post added at the end (unchanged at the 25-post limit). */
export function addToThread(body: string): string {
  const posts = parseThread(body);
  const next = addPost(posts);
  return next === posts ? body : serializeThread(next);
}

/** The stored thread text without post `index` (unchanged when out of range). */
export function removeFromThread(body: string, index: number): string {
  const posts = parseThread(body);
  const next = removePost(posts, index);
  return next === posts ? body : serializeThread(next);
}

/** The stored thread text with post `index` moved up (-1) or down (+1) (unchanged at either end). */
export function moveInThread(body: string, index: number, direction: -1 | 1): string {
  const posts = parseThread(body);
  const next = movePost(posts, index, direction);
  return next === posts ? body : serializeThread(next);
}
