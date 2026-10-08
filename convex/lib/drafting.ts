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

/** A research source as the model sees it. */
export interface SourceInput {
  kind: "link" | "quote" | "screenshot" | "note";
  label: string;
  url?: string;
  text?: string;
}

/** A source is read by the model in full up to this many characters (a whole article), not just its opening. */
const SOURCE_TEXT_MAX = 6000;
const SOURCES_MAX = 16000;

/** The topic's sources as short lines: what each is and what it says. Bounded so a long list cannot swamp the prompt. */
export function describeSources(sources: SourceInput[]): string {
  const lines: string[] = [];
  for (const s of sources) {
    const text = s.text?.trim().slice(0, SOURCE_TEXT_MAX);
    if (s.kind === "link") lines.push(`- link: ${s.label}${s.url ? ` (${s.url})` : ""}${text ? `: ${text}` : ""}`);
    else if (s.kind === "quote") lines.push(`- quote: "${text ?? s.label}"`);
    else if (s.kind === "note") lines.push(`- note: ${text ?? s.label}`);
    else lines.push(`- screenshot: ${s.label}`);
  }
  return lines.join("\n").slice(0, SOURCES_MAX);
}

/**
 * The values for the template's {{slots}}. When the founder wrote a research
 * brief it goes into the notes slot as the main material (it was written
 * from their sources), with their own notes after it; the sources go into the
 * sources slot. With no brief the notes and the old single source link work
 * exactly as before, and the model works from the topic alone.
 */
export function buildTopicVars(t: {
  title: string;
  pillar?: string;
  notes?: string;
  sourceUrl?: string;
  brief?: string;
  sources?: SourceInput[];
}): Record<string, string> {
  const notes = t.notes?.trim();
  const brief = t.brief?.trim();
  const notesSlot = brief
    ? `Brief (written from the founder's sources; this is the main material, so stay within it):\n${brief}${notes ? `\n\nThe founder's own notes:\n${notes}` : ""}`
    : notes || "(no notes — work from the topic alone)";
  const sourcesSlot = t.sources && t.sources.length > 0 ? describeSources(t.sources) : t.sourceUrl?.trim() || "(no linked sources)";
  return {
    topic: t.title,
    pillar: t.pillar?.trim() ? t.pillar.trim() : "build in public",
    notes: notesSlot,
    sources: sourcesSlot,
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
  if (templateKey === "ig-caption-beats" || templateKey === "carousel-slides") return captionConstraint(body);
  return plainConstraint(body);
}
