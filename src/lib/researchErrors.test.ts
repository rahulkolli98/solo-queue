import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { refusalCode, refusalText } from "@/lib/refusalText";
import { researchFailure } from "@/lib/researchErrors";
import { generationNextStep, studioErrorText } from "@/lib/studioErrors";

/** A fake of what the client receives when the backend throws `refusal(code, message)`. */
const fake = (code: string, message: string) => new ConvexError(`VALIDATION:${code}: ${message}`);

const PRIVACY =
  "OpenRouter blocked this model because of your privacy settings (0 endpoints out of 1 requested are available matching your guardrail restrictions and data policy). Change it at https://openrouter.ai/settings/privacy and try again.";

describe("refusal messages arrive whole", () => {
  const cases: [string, string][] = [
    ["LLM_PRIVACY", PRIVACY],
    ["LLM_AUTH", "The AI provider rejected the API key. Check LLM_API_KEY on this deployment."],
    ["LLM_CREDITS", "The AI provider says the account is out of credits."],
    ["LLM_NOT_CONFIGURED", "The AI model is not set up on this deployment (LLM_API_KEY or LLM_MODEL is missing)."],
    ["LLM_RATE_LIMIT", "The AI model is rate-limited right now. Wait a minute and try again."],
    ["LLM_ERROR", 'The AI model returned an error: upstream said "model overloaded, retry at (later)" and more.'],
  ];

  it.each(cases)("%s: Studio and Research show the backend's exact words", (code, message) => {
    const err = fake(code, message);
    expect(studioErrorText(err, "Generation failed.")).toBe(message);
    expect(refusalText(err, "x")).toBe(message);
    expect(refusalCode(err)).toBe(code);
    expect(researchFailure(err, "brief").message).toBe(message);
    expect(researchFailure(err, "angles").message).toBe(message);
  });

  it("does not cut a message that contains 'at word (' (it is wording, not a stack)", () => {
    const message = "The AI model returned an error: failed at upstream (503) after 3 tries.";
    expect(studioErrorText(fake("LLM_ERROR", message), "x")).toBe(message);
  });

  it("does not shorten a long message", () => {
    const long = `The AI model returned an error: ${"very long provider text ".repeat(20).trim()}`;
    expect(studioErrorText(fake("LLM_ERROR", long), "x")).toBe(long);
  });

  it("still falls back for a redacted server error", () => {
    expect(studioErrorText(new Error("[CONVEX A(drafting:generate)] [Request ID: 1] Server Error"), "Generation failed.")).toBe(
      "Generation failed."
    );
  });
});

describe("the next step under a failure", () => {
  it("never leaves a bare Try again: each code gets its own advice", () => {
    expect(generationNextStep("LLM_PRIVACY")).toContain("then press Retry");
    expect(generationNextStep("LLM_PRIVACY")).toContain("write it yourself");
    expect(generationNextStep("LLM_RATE_LIMIT")).toContain("Wait a minute");
    expect(generationNextStep(null)).toBe("Press Retry, or write it yourself.");
  });

  it("Write brief: message verbatim plus how to carry on", () => {
    const f = researchFailure(fake("LLM_PRIVACY", PRIVACY), "brief");
    expect(f.message).toBe(PRIVACY);
    expect(f.next).toContain("press Write brief again");
    expect(f.next).toContain("Write it myself");
  });

  it("Suggest angles: message verbatim plus how to carry on", () => {
    const f = researchFailure(fake("LLM_CREDITS", "The AI provider says the account is out of credits."), "angles");
    expect(f.next).toContain("press Suggest angles again");
    expect(f.next).toContain("send the topic to Studio");
  });

  it("an unknown failure still says what to do", () => {
    const f = researchFailure(new Error("boom"), "brief");
    expect(f.message).toBe("The brief could not be written.");
    expect(f.next).toContain("Write brief");
  });
});
