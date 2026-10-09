import { charLen } from "@/lib/draftText";

/** How much of a long source, brief or note shows before "Show more". */
export const CLAMP_LIMIT = 280;

/**
 * The first `limit` characters of `text`, cut at a word boundary and never inside a
 * character (emoji and other multi-unit characters count as one). `clipped` is false
 * when the whole text already fits, so the caller shows no toggle.
 */
export function clampText(text: string, limit: number = CLAMP_LIMIT): { short: string; clipped: boolean } {
  if (charLen(text) <= limit) return { short: text, clipped: false };
  const chars = Array.from(text);
  let cut = limit;
  // Back up to the last whitespace inside the limit; keep a hard cut for one long unbroken run.
  for (let i = limit; i > limit * 0.6; i -= 1) {
    if (/\s/.test(chars[i])) {
      cut = i;
      break;
    }
  }
  return { short: chars.slice(0, cut).join("").trimEnd(), clipped: true };
}
