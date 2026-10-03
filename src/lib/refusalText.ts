import { ConvexError } from "convex/values";
import { parseRefusal } from "../../convex/lib/slots";

const REFUSAL = /^VALIDATION:([A-Z_]+):\s*([\s\S]+)$/;

/**
 * A refusal thrown as `ConvexError("VALIDATION:CODE: message")`, read straight
 * from its data so the message reaches the screen whole. (`parseRefusal` also
 * trims anything that looks like a stack fragment, which can cut a provider's
 * own wording short; a ConvexError payload never carries a stack.)
 */
function convexRefusal(err: unknown): { code: string; message: string } | null {
  if (!(err instanceof ConvexError) || typeof err.data !== "string") return null;
  const m = REFUSAL.exec(err.data.trim());
  return m && m[2].trim() ? { code: m[1], message: m[2].trim() } : null;
}

/** The code and message of a refusal, however it reached the client, or null. */
export function refusalInfo(err: unknown): { code: string; message: string } | null {
  return convexRefusal(err) ?? parseRefusal(err);
}

/**
 * Text for the founder from anything a Convex call threw. A refusal
 * (`VALIDATION:<CODE>: message`) shows its message; other ConvexErrors show
 * their text; redacted server errors fall back to the caller's sentence so a
 * raw "[CONVEX A(...)] Server Error" never reaches the screen.
 */
export function refusalText(err: unknown, fallback: string): string {
  const refusal = refusalInfo(err);
  if (refusal) return refusal.message;
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  if (err instanceof Error) {
    const uncaught = err.message.match(/Uncaught (?:Convex)?Error: ([\s\S]*?)(?: at \w+ \(|\s*Called by client|$)/);
    if (uncaught?.[1]?.trim()) return uncaught[1].trim();
  }
  return fallback;
}

/** The refusal code (BRIEF_EDITED, HAS_SLOTS, IN_USE, LLM_PRIVACY ...) or null. */
export function refusalCode(err: unknown): string | null {
  return refusalInfo(err)?.code ?? null;
}
