import {
  MAX_THREAD_POSTS,
  THREADS_POST_LIMIT,
  cleanThread,
  parseThread,
  postLength,
  serializeThread,
} from "@/lib/draftText";
import { formatStamp } from "@/lib/queueBoard";

/**
 * Pure rules for the "Your thread" section on a Research topic: what blocks
 * saving or queueing (and why, in words the founder can act on), when the
 * text counts as unsaved, and the wording around Send to Studio and the queue.
 */

export interface OverPost {
  /** 1-based, as the writer labels it (POST 2). */
  number: number;
  over: number;
}

export interface ThreadChecks {
  /** Posts that will be saved (empty ones are dropped). */
  postCount: number;
  overPosts: OverPost[];
  canSave: boolean;
  /** Why Save is off, else null. */
  saveReason: string | null;
  canQueue: boolean;
  /** Why Queue is off, else null. A thread that can queue always has null. */
  queueReason: string | null;
}

function postNumbers(numbers: number[]): string {
  if (numbers.length === 1) return `Post ${numbers[0]}`;
  const head = numbers.slice(0, -1).join(", ");
  return `Posts ${head} and ${numbers[numbers.length - 1]}`;
}

/** What blocks saving and queueing the posts as typed. Saving tolerates over-long posts; queueing does not. */
export function threadChecks(posts: string[], limit: number = THREADS_POST_LIMIT): ThreadChecks {
  const postCount = cleanThread(posts).length;
  const overPosts: OverPost[] = [];
  posts.forEach((p, i) => {
    const over = postLength(p) - limit;
    if (over > 0) overPosts.push({ number: i + 1, over });
  });

  if (postCount === 0) {
    const reason = "Write at least one post first.";
    return { postCount, overPosts, canSave: false, saveReason: reason, canQueue: false, queueReason: reason };
  }
  if (postCount > MAX_THREAD_POSTS) {
    const reason = `A thread can have at most ${MAX_THREAD_POSTS} posts. This one has ${postCount}. Remove ${postCount - MAX_THREAD_POSTS}.`;
    return { postCount, overPosts, canSave: false, saveReason: reason, canQueue: false, queueReason: reason };
  }
  if (overPosts.length > 0) {
    const first = overPosts[0];
    const reason =
      overPosts.length === 1
        ? `${postNumbers([first.number])} is ${first.over} characters over the ${limit} limit. Shorten it to queue.`
        : `${postNumbers(overPosts.map((o) => o.number))} are over the ${limit} character limit. Shorten them to queue.`;
    return { postCount, overPosts, canSave: true, saveReason: null, canQueue: false, queueReason: reason };
  }
  return { postCount, overPosts, canSave: true, saveReason: null, canQueue: true, queueReason: null };
}

/** The stored text for these posts: tidy posts joined by `---` lines. */
export function threadBody(posts: string[]): string {
  return serializeThread(cleanThread(posts));
}

/** True when the posts, once tidied, differ from the stored text (an extra empty post is not a change). */
export function threadChanged(posts: string[], stored: string): boolean {
  return threadBody(posts) !== threadBody(parseThread(stored));
}

/** The posts to show for stored text: one empty post when nothing is written yet. */
export function postsOf(stored: string | undefined): string[] {
  return stored && stored.trim() ? parseThread(stored) : [""];
}

export type SaveState = "empty" | "unsaved" | "saving" | "saved";

/** The word beside the Save button. */
export function saveState(args: { hasDraft: boolean; changed: boolean; saving: boolean }): SaveState {
  if (args.saving) return "saving";
  if (args.changed) return "unsaved";
  return args.hasDraft ? "saved" : "empty";
}

export const SAVE_STATE_TEXT: Record<SaveState, string> = {
  empty: "Not saved yet",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
};

/** The helper line under the "Send to Studio" button, by whether a thread is already written. */
export function sendToStudioNote(hasThread: boolean, hasBrief = false): string {
  if (hasThread) return "Opens this topic in Studio with your thread already there.";
  return hasBrief
    ? "Opens this topic in Studio. Press Generate drafts and your brief and sources go to the model, which writes a thread, reel script and caption from them. Or write the thread yourself."
    : "Opens this topic in Studio. Press Generate drafts to have a thread, reel script and caption written from the topic, or write the thread yourself.";
}

/** The line shown above an empty writer. */
export const EMPTY_THREAD_NOTE = "Write your own thread here, or open Studio to have one written from your brief.";

/** "Queued for Mon 5 Oct, 19:00" in the founder's zone. */
export function queuedForText(at: number, tz: string): string {
  return `Queued for ${formatStamp(at, tz)}`;
}

/** The zone slot times are shown in: the saved setting, or the browser's when it is "auto". */
export function displayTz(setting: string | undefined, browserTz: string): string {
  return !setting || setting === "auto" ? browserTz : setting;
}
