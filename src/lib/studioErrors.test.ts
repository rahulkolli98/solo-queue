import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { studioErrorText } from "@/lib/studioErrors";

describe("studioErrorText", () => {
  it("shows the message of a VALIDATION refusal", () => {
    const e = new ConvexError("VALIDATION:MEDIA_REQUIRED: IG drafts need a photo or video.");
    expect(studioErrorText(e, "x")).toBe("IG drafts need a photo or video.");
  });

  it("strips Convex's wrapper from a thrown Error", () => {
    const e = new Error(
      "[CONVEX M(drafts:update)] [Request ID: abc] Server Error\nUncaught Error: Draft can't be empty.\n    at handler (../convex/drafts.ts:40:12)\n  Called by client"
    );
    expect(studioErrorText(e, "x")).toBe("Draft can't be empty.");
  });

  it("drops the wrapper when there is no Uncaught Error line", () => {
    const e = new Error(
      "[CONVEX A(drafting:generate)] [Request ID: 0f86] Server Error Could not find public function. Called by client"
    );
    expect(studioErrorText(e, "x")).toBe("Could not find public function.");
    expect(studioErrorText(new Error("[CONVEX A(x)] [Request ID: 1] Server Error"), "Generation failed.")).toBe(
      "Generation failed."
    );
  });

  it("passes plain messages through and falls back for unknowns", () => {
    expect(studioErrorText(new Error("The writing model timed out."), "x")).toBe("The writing model timed out.");
    expect(studioErrorText(undefined, "Generation failed.")).toBe("Generation failed.");
  });
});
