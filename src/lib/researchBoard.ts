/**
 * Pure helpers for the Research screen: what the capture bar was given, the
 * headline, list rows, ages and the labels on source and angle cards.
 * Readiness itself lives in convex/lib/research (READY / NEEDS N MORE).
 */

export type CaptureKind = "link" | "quote" | "note";

export interface Capture {
  kind: CaptureKind;
  url?: string;
  text?: string;
}

const WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
];

/** "Four" for 4, up to twelve; digits after that. */
export function numberWord(n: number): string {
  return n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}

function parseHttpUrl(token: string): string | null {
  try {
    const u = new URL(token);
    return u.protocol === "http:" || u.protocol === "https:" ? token : null;
  } catch {
    return null;
  }
}

const QUOTE_PAIRS: [string, string][] = [
  ["“", "”"],
  ['"', '"'],
  ["‘", "’"],
];

/**
 * Decides what a pasted string is: a link (optionally followed by a comment),
 * a quote (wrapped in quotation marks) or a plain half-thought. Returns null
 * for blank input.
 */
export function detectCapture(raw: string): Capture | null {
  const value = raw.trim();
  if (!value) return null;
  const [first, ...rest] = value.split(/\s+/);
  const url = parseHttpUrl(first);
  if (url) {
    const text = rest.join(" ").trim();
    return text ? { kind: "link", url, text } : { kind: "link", url };
  }
  for (const [open, close] of QUOTE_PAIRS) {
    if (value.length > 2 && value.startsWith(open) && value.endsWith(close)) {
      const inner = value.slice(open.length, value.length - close.length).trim();
      if (inner) return { kind: "quote", text: inner };
    }
  }
  return { kind: "note", text: value };
}

export interface HeadlineParts {
  before: string;
  rust: string;
  after: string;
}

/** The page statement in two lines with the one rust word split out: "Four topics," / "ripe for posting." */
export function researchHeadline(readyCount: number, total: number): HeadlineParts {
  if (total === 0) return { before: "Nothing saved", rust: "yet.", after: "" };
  if (readyCount === 0) return { before: "Nothing is", rust: "ripe", after: " yet." };
  const noun = readyCount === 1 ? "topic" : "topics";
  return { before: `${numberWord(readyCount)} ${noun},`, rust: "ripe", after: " for posting." };
}

/** "3S", "12 M", "5 H", "2 D", "1 W": how long ago something was saved, for mono labels. */
export function shortAge(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 60) return `${s}S`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} M`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} H`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} D`;
  return `${Math.floor(d / 7)} W`;
}

/** "3 SOURCES · SAVED 2 D AGO" */
export function topicMetaLine(sourceCount: number, createdAt: number, now: number): string {
  const sources = `${sourceCount} ${sourceCount === 1 ? "SOURCE" : "SOURCES"}`;
  return `${sources} · SAVED ${shortAge(createdAt, now)} AGO`;
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export interface TopicLike {
  _id: string;
  status: "drafting" | "ready" | "queued" | "done";
  pillar?: string;
}

/** Topics already sent on to Studio (queued or done) leave the working list. */
export function isSent(topic: Pick<TopicLike, "status">): boolean {
  return topic.status === "queued" || topic.status === "done";
}

/** Splits board rows into the working list and the "sent to Studio" box, applying the pillar filter. */
export function splitTopics<T extends TopicLike>(
  rows: T[],
  pillar: string | null
): { active: T[]; sent: T[]; activeTotal: number } {
  const matches = (t: T) => !pillar || t.pillar === pillar;
  const active = rows.filter((t) => !isSent(t));
  return {
    active: active.filter(matches),
    sent: rows.filter((t) => isSent(t)).filter(matches),
    activeTotal: active.length,
  };
}

/** The selected topic: the one in the URL if it exists, else the first one listed. */
export function pickSelected<T extends { _id: string }>(
  rows: T[],
  requestedId: string | null,
  fallbackPool: T[]
): T | null {
  if (requestedId) {
    const hit = rows.find((t) => t._id === requestedId);
    if (hit) return hit;
  }
  return fallbackPool[0] ?? rows[0] ?? null;
}

export interface SourceLike {
  kind: "link" | "quote" | "screenshot" | "note";
}

/** "3 sources · 1 note": notes are counted apart from the clippings. */
export function sourceSummary(sources: SourceLike[]): string {
  const notes = sources.filter((s) => s.kind === "note").length;
  const clippings = sources.length - notes;
  const a = `${clippings} ${clippings === 1 ? "source" : "sources"}`;
  const b = `${notes} ${notes === 1 ? "note" : "notes"}`;
  return `${a} · ${b}`;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const FORMAT_LABEL: Record<string, string> = {
  thread: "THREAD",
  single: "SINGLE",
  caption: "CAPTION",
  reel: "REEL",
  carousel: "CAROUSEL",
};

/** "THREADS · SINGLE · MYTH-BUST": platform, format and the story frame an angle suggests. */
export function angleLabel(
  angle: { platform: string; format: string; frameKey: string },
  frames: { key: string; name: string }[]
): string {
  const frame = frames.find((f) => f.key === angle.frameKey);
  const parts = [
    angle.platform.toUpperCase(),
    FORMAT_LABEL[angle.format] ?? angle.format.toUpperCase(),
  ];
  if (frame) parts.push(frame.name.toUpperCase());
  return parts.join(" · ");
}

/** Splits a brief into paragraphs on blank lines. */
export function briefParagraphs(brief: string): string[] {
  return brief
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** A readable title for a link source: the host and path without the scheme. */
export function linkTitle(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    const title = `${u.hostname.replace(/^www\./, "")}${path}`;
    return title.length > 60 ? `${title.slice(0, 57)}...` : title;
  } catch {
    return url;
  }
}
