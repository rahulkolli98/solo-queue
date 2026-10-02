import { ConvexError } from "convex/values";
import { parseRefusal } from "../../convex/lib/slots";

/**
 * Text for the founder from anything a Convex call threw. A refusal
 * (`VALIDATION:<CODE>: message`) shows its message; other ConvexErrors show
 * their text; redacted server errors fall back to the caller's sentence so a
 * raw "[CONVEX A(...)] Server Error" never reaches the screen.
 */
export function refusalText(err: unknown, fallback: string): string {
  const refusal = parseRefusal(err);
  if (refusal) return refusal.message;
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  if (err instanceof Error) {
    const uncaught = err.message.match(/Uncaught (?:Convex)?Error: ([\s\S]*?)(?: at \w+ \(|\s*Called by client|$)/);
    if (uncaught?.[1]?.trim()) return uncaught[1].trim();
  }
  return fallback;
}

/** The refusal code (BRIEF_EDITED, HAS_SLOTS, IN_USE, REST_PERIOD ...) or null. */
export function refusalCode(err: unknown): string | null {
  return parseRefusal(err)?.code ?? null;
}
