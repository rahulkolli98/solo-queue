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
        ? posts.every((p) => p.length <= 500)
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
