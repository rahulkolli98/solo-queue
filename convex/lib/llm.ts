import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { ConvexError } from "convex/values";
import { refusal } from "./slots";

const OPENROUTER_URL = "https://openrouter.ai/api/v1";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      `Missing env: ${name}. Set it where the backend runs (.env.local for local dev, Convex dashboard for prod).`
    );
  return value;
}

/**
 * The one place the LLM provider is configured: OpenRouter through the AI SDK's
 * OpenAI-compatible provider. Reads LLM_API_KEY and LLM_MODEL (required),
 * LLM_BASE_URL (optional) and APP_BASE_URL (optional attribution header).
 * Used by drafting and by the research brief/angles.
 */
export function llmModel(): LanguageModel {
  const apiKey = requireEnv("LLM_API_KEY");
  const modelId = requireEnv("LLM_MODEL");
  const headers: Record<string, string> = {};
  if (process.env.APP_BASE_URL) {
    headers["HTTP-Referer"] = process.env.APP_BASE_URL;
    headers["X-Title"] = "Solo Queue";
  }
  const provider = createOpenAICompatible({
    name: "openrouter",
    baseURL: process.env.LLM_BASE_URL ?? OPENROUTER_URL,
    apiKey,
    headers,
  });
  return provider(modelId);
}

/** Strip anything that looks like a key and keep messages short enough for a toast. */
function plain(message: string, max = 240): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[key]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Turn whatever the AI call threw into a refusal whose message the founder can
 * act on. Production redacts plain errors to "Server Error", so the reason has
 * to travel as a `VALIDATION:` ConvexError. Refusals pass through untouched.
 */
export function llmFailure(err: unknown): ConvexError<string> {
  if (err instanceof ConvexError) return err as ConvexError<string>;
  const e = err as { name?: string; message?: string; statusCode?: number };
  const message = typeof e?.message === "string" ? e.message : "";
  if (message.startsWith("Missing env:")) {
    return refusal("LLM_NOT_CONFIGURED", "LLM_API_KEY or LLM_MODEL is missing on this deployment. Set both in the Convex environment.");
  }
  if (/guardrail|data policy|privacy/i.test(message)) {
    return refusal(
      "LLM_PRIVACY",
      "OpenRouter blocked this model because of your account privacy settings. Allow it at openrouter.ai/settings/privacy, or choose a different model."
    );
  }
  const status = e?.statusCode;
  if (status === 401 || status === 403) {
    return refusal("LLM_AUTH", "The AI provider rejected the API key. Check LLM_API_KEY on this deployment.");
  }
  if (status === 402) {
    return refusal("LLM_CREDITS", "The AI provider says the account is out of credits. Add credits with the provider, then retry.");
  }
  if (status === 404) {
    return refusal("LLM_MODEL", "The AI provider does not know the configured model. Check LLM_MODEL on this deployment.");
  }
  if (status === 429) {
    return refusal("LLM_RATE_LIMIT", "The AI model is rate-limited right now. Wait a minute and try again.");
  }
  if (e?.name === "AI_APICallError" || status !== undefined) {
    return refusal("LLM_ERROR", `The AI model returned an error: ${plain(message, 200)}`);
  }
  return refusal("LLM_ERROR", `The AI call failed: ${plain(message || "unknown error", 200)}`);
}

/** Run an AI call and report failures as readable refusals. */
export async function withLlmErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    console.error(`llm: ${plain(err instanceof Error ? err.message : String(err), 300)}`);
    throw llmFailure(err);
  }
}
