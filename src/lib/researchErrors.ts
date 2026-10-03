import { refusalCode, refusalText } from "@/lib/refusalText";

export interface ResearchFailure {
  /** The backend's own words, whole. */
  message: string;
  /** What to do next. */
  next: string;
}

const SETUP_CODES = new Set(["LLM_PRIVACY", "LLM_AUTH", "LLM_CREDITS", "LLM_MODEL", "LLM_NOT_CONFIGURED"]);

/**
 * What the Research screen shows when "Write brief" or "Suggest angles" fails:
 * the refusal message verbatim plus the next step, never a bare "Try again".
 */
export function researchFailure(err: unknown, kind: "brief" | "angles"): ResearchFailure {
  const message = refusalText(
    err,
    kind === "brief" ? "The brief could not be written." : "The angles could not be suggested."
  );
  const code = refusalCode(err);
  const again = kind === "brief" ? "press Write brief again" : "press Suggest angles again";
  const alone =
    kind === "brief"
      ? "You can also press Write it myself and type the brief."
      : "You can still send the topic to Studio without angles.";
  if (code && SETUP_CODES.has(code)) {
    return { message, next: `Fix that in your AI provider or deployment settings, then ${again}. ${alone}` };
  }
  if (code === "LLM_RATE_LIMIT") return { message, next: `Wait a minute, then ${again}. ${alone}` };
  return { message, next: `Try once more: ${again}. ${alone}` };
}
