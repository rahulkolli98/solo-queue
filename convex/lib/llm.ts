import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

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
