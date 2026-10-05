/**
 * Pure text helpers for the Studio editor: emoji-aware length, the Threads
 * thread format (posts joined by lines containing only `---`), Trim / Split
 * actions, reel-script parsing and the blog `.md` export name.
 */

export const THREADS_POST_LIMIT = 500;
export const CAPTION_LIMIT = 2200;

/** Emoji-aware length: counts code points, not UTF-16 units. */
export function charLen(s: string): number {
  return Array.from(s).length;
}

/** Whitespace-separated word count (blog header). */
export function wordCount(s: string): number {
  const m = s.trim().match(/\S+/g);
  return m ? m.length : 0;
}

const SEPARATOR_LINE = /^[ \t]*---[ \t]*$/;

/**
 * The posts of a thread exactly as typed: split on lines that hold only `---`.
 * Empty and untrimmed posts are kept so editing never makes a box vanish
 * under the cursor; `cleanThread` tidies them when it is safe to.
 */
export function parseThread(body: string): string[] {
  const posts: string[] = [];
  let current: string[] = [];
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    if (SEPARATOR_LINE.test(line)) {
      posts.push(current.join("\n"));
      current = [];
    } else {
      current.push(line);
    }
  }
  posts.push(current.join("\n"));
  return posts;
}

/** The most posts one thread may have (matches the server). */
export const MAX_THREAD_POSTS = 25;

/** A new empty post at the end, or the same list when the thread is already at the limit. */
export function addPost(posts: string[]): string[] {
  return posts.length >= MAX_THREAD_POSTS ? posts : [...posts, ""];
}

/** Remove one post; a thread always keeps at least one (the last one is emptied instead). */
export function removePost(posts: string[], index: number): string[] {
  if (index < 0 || index >= posts.length) return posts;
  if (posts.length === 1) return [""];
  return posts.filter((_, i) => i !== index);
}

/** Move one post up (-1) or down (+1); out-of-range moves leave the list as it is. */
export function movePost(posts: string[], index: number, direction: -1 | 1): string[] {
  const to = index + direction;
  if (index < 0 || index >= posts.length || to < 0 || to >= posts.length) return posts;
  const next = [...posts];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Posts back to the stored form: plain posts joined by `\n---\n`. */
export function serializeThread(posts: string[]): string {
  return posts.join("\n---\n");
}

/** Trim every post and drop empty ones (done on blur and before queueing). */
export function cleanThread(posts: string[]): string[] {
  return posts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Length the Threads limit applies to: the trimmed post. */
export function postLength(post: string): number {
  return charLen(post.trim());
}

/** How far the longest post is past the limit; 0 when every post fits. */
export function threadOverBy(posts: string[], limit = THREADS_POST_LIMIT): number {
  return Math.max(0, ...posts.map((p) => postLength(p) - limit));
}

/** How many posts are past the limit. */
export function overPostCount(posts: string[], limit = THREADS_POST_LIMIT): number {
  return posts.filter((p) => postLength(p) > limit).length;
}

const SENTENCE_END = /[.!?…]["')\]]*$/;

/** Indexes (into `chars`) just after each sentence end that is followed by whitespace. */
function sentenceCuts(chars: string[]): number[] {
  const cuts: number[] = [];
  for (let i = 0; i < chars.length - 1; i++) {
    if (!/\s/.test(chars[i + 1])) continue;
    if (SENTENCE_END.test(chars.slice(Math.max(0, i - 3), i + 1).join(""))) cuts.push(i + 1);
  }
  return cuts;
}

/**
 * Shorten `text` to at most `limit` characters without cutting a word:
 * prefer the last sentence end in the second half of the allowance, then the
 * last space, then a hard cut with an ellipsis.
 */
export function trimToFit(text: string, limit = THREADS_POST_LIMIT): string {
  const trimmed = text.trim();
  const chars = Array.from(trimmed);
  if (chars.length <= limit) return trimmed;
  const floor = Math.floor(limit * 0.5);
  const cut = sentenceCuts(chars)
    .filter((c) => c >= floor && c <= limit)
    .pop();
  if (cut !== undefined) return chars.slice(0, cut).join("").trim();
  for (let i = limit - 1; i > floor; i--) {
    if (/\s/.test(chars[i])) return chars.slice(0, i).join("").replace(/[\s,;:]+$/, "") + "…";
  }
  return chars.slice(0, limit - 1).join("").trimEnd() + "…";
}

/**
 * Split one post in two near its middle, at a sentence end if one is close,
 * else at a space. Returns the text unchanged (one element) if it cannot split.
 */
export function splitInTwo(text: string): string[] {
  const trimmed = text.trim();
  const chars = Array.from(trimmed);
  if (chars.length < 2) return [trimmed];
  const mid = chars.length / 2;
  const nearest = (cuts: number[]) =>
    cuts.reduce<number | undefined>(
      (best, c) => (best === undefined || Math.abs(c - mid) < Math.abs(best - mid) ? c : best),
      undefined
    );
  const sentence = nearest(sentenceCuts(chars).filter((c) => Math.abs(c - mid) <= chars.length * 0.3));
  const spaces: number[] = [];
  chars.forEach((c, i) => {
    if (/\s/.test(c) && i > 0 && i < chars.length - 1) spaces.push(i);
  });
  const at = sentence ?? nearest(spaces);
  if (at === undefined) return [trimmed];
  const a = chars.slice(0, at).join("").trim();
  const b = chars.slice(at).join("").trim();
  return a && b ? [a, b] : [trimmed];
}

export interface ReelScene {
  time: string;
  label: string | null;
  text: string;
}

export interface ReelScript {
  scenes: ReelScene[];
  /** The one-line caption after the `---` line, when there is one. */
  caption: string | null;
}

const SCENE_LINE = /^\s*(?:\d+[.)]\s*)?(\d+:\d{2})\s*[–—-]\s*(\d+:\d{2})\s*[—–:-]*\s*(.*)$/;
const SCENE_LABEL = /^(On screen|VO|B-roll|CTA|Voice-over|Voiceover)\s*:\s*/i;

/** Timed scenes of a reel script, or null when the body is not in that shape. */
export function parseReelScript(body: string): ReelScript | null {
  const posts = parseThread(body);
  const script = posts[0] ?? "";
  const scenes: ReelScene[] = [];
  for (const line of script.split("\n")) {
    const m = SCENE_LINE.exec(line);
    if (!m) continue;
    const rest = m[3].trim();
    const labelled = SCENE_LABEL.exec(rest);
    scenes.push({
      time: `${m[1]}–${m[2]}`,
      label: labelled ? labelled[1] : null,
      text: labelled ? rest.slice(labelled[0].length).trim() : rest,
    });
  }
  if (scenes.length === 0) return null;
  const caption = posts.slice(1).join("\n").trim();
  return { scenes, caption: caption || null };
}

/** `my-topic-title-2026-10-02.md` for the blog download. */
export function markdownFilename(title: string | undefined, date: Date = new Date()): string {
  const slug = (title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${slug || "draft"}-${date.toISOString().slice(0, 10)}.md`;
}
