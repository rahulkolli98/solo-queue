/**
 * Pure helpers for draft generation — no I/O, unit-tested.
 * The `drafting.generate` action in ../drafting.ts orchestrates these.
 */

export interface TopicInputs {
  title: string;
  pillar: string;
  notes?: string;
  sourceUrl?: string;
}

/** Fill {{slots}} in a template body. Unknown slots are left intact. */
export function fillSlots(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (match, key: string) =>
    key in vars ? vars[key] : match
  );
}

export function buildTopicVars(t: {
  title: string;
  pillar?: string;
  notes?: string;
  sourceUrl?: string;
}): Record<string, string> {
  return {
    topic: t.title,
    pillar: t.pillar?.trim() ? t.pillar.trim() : "build in public",
    notes: t.notes?.trim() ? t.notes.trim() : "(no notes — work from the topic alone)",
    sources: t.sourceUrl?.trim() ? t.sourceUrl.trim() : "(no linked sources)",
  };
}

/** Split a generated body into posts on standalone --- lines. */
export function splitPosts(body: string): string[] {
  return body
    .split(/^\s*---\s*$/m)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** A beat label with its counter, as the Threads template asks for: "HOOK · 117 / 500". */
const BEAT_HEADER = /^\s*\**\s*[A-Za-z][^\n]{0,40}?\s*[·•|]\s*\d+\s*\/\s*500\s*\**\s*$/;

/** Marker the drafting prompt uses where a fact is missing: [[your number]]. */
const PLACEHOLDER = /\[\[[^\]]*\]\]/;

/** True when a draft still has a [[placeholder]] the founder has to fill in. Never publish one. */
export function hasPlaceholder(body: string): boolean {
  return PLACEHOLDER.test(body);
}

/**
 * Drop the beat-label line a model puts above each post when it answers in
 * plain text. What is stored is what is published, so a "HOOK · 117 / 500"
 * line must never reach the post. Posts without such a line are untouched.
 */
export function stripBeatHeaders(body: string): string {
  const posts = body.split(/^[ \t]*---[ \t]*$/m).map((p) => p.trim());
  return posts
    .map((post) => {
      const lines = post.split("\n");
      return (BEAT_HEADER.test(lines[0]) ? lines.slice(1) : lines).join("\n").trim();
    })
    .filter((p) => p.length > 0)
    .join("\n---\n");
}

/**
 * The text Instagram should post for a draft. A reel draft is the timed script,
 * a `---` line, then the one-line caption: only the caption is posted. A
 * caption draft may end with a `---` line and a "CAPTION · n / 2,200" counter
 * footer from the template: that footer is not part of the post.
 */
export function instagramCaption(templateKey: string, body: string): string {
  const parts = body.split(/^[ \t]*---[ \t]*$/m).map((p) => p.trim());
  if (parts.length < 2) return body.trim();
  if (templateKey === "reel-script") {
    return parts.slice(1).join("\n").trim() || body.trim();
  }
  const last = parts[parts.length - 1];
  return /^CAPTION\s*·/i.test(last) ? parts.slice(0, -1).join("\n---\n").trim() : body.trim();
}

/** The most posts one thread may have. Threads allows long chains; this keeps a mistake from posting dozens. */
export const MAX_THREAD_POSTS = 25;

export function threadsConstraint(body: string): {
  charCount: number;
  constraintOk: boolean;
} {
  const posts = splitPosts(body);
  const longest = posts.reduce((max, p) => Math.max(max, p.length), 0);
  return {
    charCount: posts.length > 0 ? longest : body.trim().length,
    constraintOk:
      posts.length > 0
        ? posts.length <= MAX_THREAD_POSTS && posts.every((p) => p.length <= 500)
        : body.trim().length <= 500,
  };
}

export function captionConstraint(body: string): {
  charCount: number;
  constraintOk: boolean;
} {
  const len = body.trim().length;
  return { charCount: len, constraintOk: len <= 2200 };
}

export function plainConstraint(body: string): {
  charCount: number;
  constraintOk: boolean;
} {
  return { charCount: body.trim().length, constraintOk: true };
}

/**
 * Recompute charCount/constraintOk for an edited draft body, using the same
 * mapping as generation: threads posts ≤500 each, IG captions ≤2200,
 * everything else unconstrained. Shared by the update mutation and (via
 * mirrored client logic) the composer's live badges.
 */
export function checkEditedBody(
  platform: "threads" | "instagram" | "blog",
  templateKey: string,
  body: string
): { charCount: number; constraintOk: boolean } {
  if (platform === "threads") return threadsConstraint(body);
  if (templateKey === "ig-caption-beats") return captionConstraint(body);
  return plainConstraint(body);
}
