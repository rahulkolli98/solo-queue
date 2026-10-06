/**
 * Pure voice rules: the founder's never-use words, the thread sign-off and the
 * Instagram hashtag cap. No I/O, so they are unit-tested. `drafting.generate`
 * applies the sign-off and the cap; Studio uses `findBannedWords` to flag a
 * draft as it is edited.
 */

const WORD_CHAR = "[\\p{L}\\p{N}_]";

function escapeRegExp(s: string): string {
  // Only syntax characters: the pattern runs in unicode mode, where other escapes (such as "\-") are errors.
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** One banned word or phrase as a whole-word, case-insensitive, Unicode-aware pattern. */
function bannedPattern(word: string): RegExp {
  // Spaces inside a phrase match any run of whitespace ("crush it" finds "Crush   it").
  const body = word
    .trim()
    .split(/\s+/)
    .map(escapeRegExp)
    .join("\\s+");
  return new RegExp(`(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})`, "iu");
}

/**
 * The distinct banned words or phrases that appear in `text`, in the order of
 * the banned list. Matches whole words only ("unlock" is not found in
 * "unlocked"), ignoring case; a phrase matches across any spacing.
 */
export function findBannedWords(text: string, banned: string[]): string[] {
  if (!text) return [];
  const found: string[] = [];
  const seen = new Set<string>();
  for (const raw of banned) {
    const word = raw.trim();
    const key = word.toLowerCase();
    if (!word || seen.has(key)) continue;
    seen.add(key);
    if (bannedPattern(word).test(text)) found.push(word);
  }
  return found;
}

/**
 * Add the founder's sign-off to the LAST post of a thread, on its own line
 * after a blank line. Skipped (posts returned unchanged) when there is no
 * sign-off, the last post already ends with it, or the result would be past
 * `limit` characters. Length is `.length`, the measure the server's thread
 * constraint uses, so a stored draft stays within the limit. Never mutates.
 */
export function applySignOff(posts: string[], signOff: string | undefined, limit = 500): string[] {
  const sign = signOff?.trim();
  if (!sign || posts.length === 0) return posts;
  const last = posts[posts.length - 1].trimEnd();
  if (last.endsWith(sign)) return posts;
  const next = `${last}\n\n${sign}`;
  if (next.length > limit) return posts;
  return [...posts.slice(0, -1), next];
}

/** A hashtag: `#` plus letters, digits or underscores, at the start of the text or after whitespace. */
const HASHTAG = /(?<![^\s])#[\p{L}\p{N}_]+/gu;
const HSPACE = /[ \t]/;

/**
 * Keep the first `max` hashtags and remove the rest without leaving double
 * spaces, empty gaps or trailing spaces. `max` 0 removes all. Text with no
 * more than `max` hashtags is returned unchanged.
 */
export function limitHashtags(caption: string, max: number): string {
  const keep = Math.max(0, Math.floor(max));
  const tags = [...caption.matchAll(HASHTAG)];
  if (tags.length <= keep) return caption;

  let out = "";
  let cursor = 0;
  for (const tag of tags.slice(keep)) {
    let start = tag.index;
    let end = start + tag[0].length;
    // Take the spaces before the tag with it, unless the tag starts a line;
    // then take the spaces after it instead, so the line does not start with a gap.
    let back = start;
    while (back > 0 && HSPACE.test(caption[back - 1])) back--;
    if (back === 0 || caption[back - 1] === "\n") {
      while (end < caption.length && HSPACE.test(caption[end])) end++;
    } else {
      start = back;
    }
    start = Math.max(start, cursor);
    out += caption.slice(cursor, start);
    cursor = Math.max(cursor, end);
  }
  out += caption.slice(cursor);
  return out
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The longest voice description the settings accept. */
export const VOICE_DESCRIPTION_MAX = 600;
/** How many of the founder's published posts the retrain suggestion reads. */
export const SUGGEST_POST_LIMIT = 20;
const SUGGEST_POST_CHARS = 700;

/** The model's proposed description, tidied: quotes and a leading "Voice:" label dropped, then clamped. */
export function cleanDescription(raw: string): string {
  const text = raw
    .trim()
    .replace(/^voice\s*:\s*/i, "")
    .replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(text);
  if (chars.length <= VOICE_DESCRIPTION_MAX) return text;
  return chars.slice(0, VOICE_DESCRIPTION_MAX).join("").trimEnd();
}

/**
 * The prompt that asks for a new voice description from the founder's own
 * published posts. The current description is shown as the register to match
 * (short, concrete, what to do and what to avoid).
 */
export function buildVoiceSuggestPrompt(currentDescription: string, posts: string[]): { system: string; prompt: string } {
  const system =
    "You write a founder's voice description for a drafting tool. Output only the description: one paragraph of plain text, " +
    `at most ${VOICE_DESCRIPTION_MAX} characters, no quotes, no label, no list. ` +
    "Describe what this founder's writing actually does (sentence length, tone, what they say and how), and what to avoid. " +
    "Be short and concrete. Base it only on the posts you are given; do not invent traits.";
  const current = currentDescription.trim() || "(none yet)";
  const numbered = posts
    .map((p, i) => `Post ${i + 1}:\n${p.trim().slice(0, SUGGEST_POST_CHARS)}`)
    .join("\n\n");
  const prompt =
    `Current voice description (match its register: short, concrete, what to do and what to avoid):\n${current}\n\n` +
    `The founder's ${posts.length} most recent published ${posts.length === 1 ? "post" : "posts"}, newest first:\n\n${numbered}\n\n` +
    "Write the updated voice description.";
  return { system, prompt };
}
