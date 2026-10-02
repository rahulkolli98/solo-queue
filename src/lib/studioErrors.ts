import { parseRefusal } from "../../convex/lib/slots";
import { errorText } from "@/lib/errors";

/**
 * One readable line for any error from a Studio call: a `VALIDATION:CODE:`
 * refusal shows its message, a thrown Error shows the human part of Convex's
 * "[CONVEX M(fn)] ... Uncaught Error: ..." wrapper.
 */
export function studioErrorText(e: unknown, fallback: string): string {
  const refusal = parseRefusal(e);
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
