/**
 * Research board helpers: source validation, readiness, topic titles from a
 * capture, and the prompts/parsers for the brief and angles. Pure and
 * unit-tested; the Convex functions in sources.ts / research.ts call these.
 */
import { z } from "zod";

export type SourceKind = "link" | "quote" | "screenshot" | "note";

export const MIN_SOURCES_FOR_READY = 2;
export const BRIEF_WORDS = 140;

export interface ReadinessInput {
  sourceCount: number;
  hasNotes: boolean;
  hasBrief: boolean;
}

export interface Readiness {
  ready: boolean;
  /** Sources still missing; 0 when ready. Drives the "NEEDS N MORE" label. */
  needsMore: number;
}

/** READY with 2+ sources, or a note plus a brief; otherwise it says how many sources are missing. */
export function readiness({ sourceCount, hasNotes, hasBrief }: ReadinessInput): Readiness {
  if (sourceCount >= MIN_SOURCES_FOR_READY) return { ready: true, needsMore: 0 };
  if (hasNotes && hasBrief) return { ready: true, needsMore: 0 };
  return { ready: false, needsMore: MIN_SOURCES_FOR_READY - sourceCount };
}

export function readinessLabel(r: Readiness): string {
  return r.ready ? "READY" : `NEEDS ${r.needsMore} MORE`;
}

export interface SourceInput {
  kind: SourceKind;
  url?: string;
  text?: string;
  label?: string;
  mediaAssetId?: string;
}

export type SourceCheck =
  | { ok: true; kind: SourceKind; url?: string; text?: string; label: string; mediaAssetId?: string }
  | { ok: false; code: string; message: string };

const MAX_TEXT = 2000;
const MAX_URL = 2000;

function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

/** Validates and normalizes one clipping. Links must be http(s); quotes and notes need text; screenshots need an uploaded file. */
export function checkSource(input: SourceInput): SourceCheck {
  const url = input.url?.trim() || undefined;
  const text = input.text?.trim() || undefined;
  const label = input.label?.trim() || undefined;
  if (text && text.length > MAX_TEXT) {
    return { ok: false, code: "TOO_LONG", message: `Keep it under ${MAX_TEXT} characters.` };
  }
  switch (input.kind) {
    case "link": {
      if (!url) return { ok: false, code: "URL_REQUIRED", message: "Paste a link." };
      if (url.length > MAX_URL) return { ok: false, code: "TOO_LONG", message: "That link is too long." };
      let host: string;
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("protocol");
        host = hostOf(url);
      } catch {
        return { ok: false, code: "BAD_URL", message: "That does not look like a web link (http or https)." };
      }
      return { ok: true, kind: "link", url, text, label: label ?? host };
    }
    case "quote":
    case "note": {
      if (!text) {
        return {
          ok: false,
          code: "TEXT_REQUIRED",
          message: input.kind === "quote" ? "Paste the quote." : "Write the note.",
        };
      }
      return {
        ok: true,
        kind: input.kind,
        text,
        label: label ?? (input.kind === "quote" ? "Quote" : "Your note"),
      };
    }
    case "screenshot": {
      if (!input.mediaAssetId) {
        return { ok: false, code: "MEDIA_REQUIRED", message: "Upload the screenshot first." };
      }
      return { ok: true, kind: "screenshot", mediaAssetId: input.mediaAssetId, label: label ?? "Screenshot" };
    }
  }
}

/**
 * A topic title for something pasted into the capture bar with no topic yet:
 * the first line of text, else the link's host and path, trimmed to 80 chars.
 */
export function titleFromCapture(input: { text?: string; url?: string }): string {
  const firstLine = input.text?.split("\n").map((l) => l.trim()).find(Boolean);
  const raw = firstLine ?? (input.url ? urlTitle(input.url) : "Untitled topic");
  return raw.length > 80 ? `${raw.slice(0, 77).trimEnd()}...` : raw;
}

function urlTitle(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    return `${u.hostname.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

// ----- brief + angles prompts / parsing -----

export interface BriefSource {
  kind: SourceKind;
  label: string;
  url?: string;
  text?: string;
}

export function buildBriefPrompt(args: {
  title: string;
  notes?: string;
  sources: BriefSource[];
}): string {
  const lines: string[] = [`Topic: ${args.title}`];
  if (args.notes) lines.push(`Founder's notes: ${args.notes}`);
  if (args.sources.length) {
    lines.push("Sources:");
    args.sources.forEach((s, i) => {
      const body = s.text ? `: ${s.text}` : s.url ? ` (${s.url})` : "";
      lines.push(`${i + 1}. [${s.kind}] ${s.label}${body}`);
    });
  }
  lines.push(
    `Write a brief of about ${BRIEF_WORDS} words for the founder to post from. Plain prose, no headings, no bullet points, no preamble. Use only what the topic, notes and sources say; do not invent facts or numbers. Keep it concrete and slightly dry.`
  );
  return lines.join("\n");
}

export const anglesSchema = z.object({
  angles: z
    .array(
      z.object({
        platform: z.enum(["threads", "instagram"]),
        format: z.enum(["thread", "single", "caption", "reel", "carousel"]),
        frameKey: z.string(),
        title: z.string().min(1).max(120),
      })
    )
    .length(3),
});

export type Angle = z.infer<typeof anglesSchema>["angles"][number];

export function buildAnglesPrompt(args: {
  title: string;
  brief?: string;
  frames: { key: string; name: string; fits: string[] }[];
}): string {
  const frames = args.frames
    .map((f) => `- ${f.key} (${f.name}), fits: ${f.fits.join(", ")}`)
    .join("\n");
  return [
    `Topic: ${args.title}`,
    args.brief ? `Brief: ${args.brief}` : "",
    "Available story frames:",
    frames,
    "Suggest exactly 3 angles for posts on this topic. Each angle names a platform (threads or instagram), a format (thread, single, caption, reel or carousel), one frame key from the list that fits that format, and a short working title. Vary the platform and format across the three.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Keeps only angles whose frame exists and fits the format; returns what is usable. */
export function usableAngles(
  angles: Angle[],
  frames: { key: string; fits: string[] }[]
): Angle[] {
  const byKey = new Map(frames.map((f) => [f.key, f]));
  return angles.filter((a) => {
    const frame = byKey.get(a.frameKey);
    if (!frame) return false;
    // "caption" is the Instagram single-image post; it fits frames that fit "single".
    const fit = a.format === "caption" ? "single" : a.format;
    return frame.fits.includes(fit);
  });
}
