import { errorText } from "@/lib/errors";
import { refusalInfo } from "@/lib/refusalText";

/**
 * One readable line for any error from a Studio call: a `VALIDATION:CODE:`
 * refusal shows its message whole, a thrown Error shows the human part of
 * Convex's "[CONVEX M(fn)] ... Uncaught Error: ..." wrapper.
 */
export function studioErrorText(e: unknown, fallback: string): string {
  const refusal = refusalInfo(e);
  if (refusal) return refusal.message;
  const text = errorText(e, fallback);
  const wrapped = text.match(/Uncaught (?:Convex)?Error:\s*([\s\S]*?)(?:\s+at \w+ \(|\s+Called by client|$)/);
  if (wrapped) return wrapped[1].trim() || fallback;
  const plain = text
    .replace(/\[CONVEX [^\]]*\]/g, "")
    .replace(/\[Request ID: [^\]]*\]/g, "")
    .replace(/\s*Called by client\s*$/, "")
    .replace(/^\s*Server Error\s*/, "")
    .trim();
  return plain || fallback;
}

/** The next step to show under a generation failure, by refusal code. */
export function generationNextStep(code: string | null | undefined): string {
  switch (code) {
    case "LLM_PRIVACY":
    case "LLM_AUTH":
    case "LLM_CREDITS":
    case "LLM_MODEL":
    case "LLM_NOT_CONFIGURED":
      return "Fix that in your AI provider or deployment settings, then press Retry. You can also write it yourself.";
    case "LLM_RATE_LIMIT":
      return "Wait a minute, then press Retry. You can also write it yourself.";
    default:
      return "Press Retry, or write it yourself.";
  }
}
