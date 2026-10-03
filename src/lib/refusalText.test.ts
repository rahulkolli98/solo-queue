import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { refusalCode, refusalText } from "@/lib/refusalText";

describe("refusalText", () => {
  it("shows the message of a refusal", () => {
    const err = new ConvexError("VALIDATION:HAS_SLOTS: This topic has queued or published posts.");
    expect(refusalText(err, "fallback")).toBe("This topic has queued or published posts.");
    expect(refusalCode(err)).toBe("HAS_SLOTS");
  });
  it("reads a refusal wrapped in a plain Error from the client", () => {
    const err = new Error(
      "[CONVEX A(research:brief)] Uncaught ConvexError: VALIDATION:BRIEF_EDITED: You edited this brief. at handler (../convex/research.ts:27:6) Called by client"
    );
    expect(refusalCode(err)).toBe("BRIEF_EDITED");
    expect(refusalText(err, "x")).toBe("You edited this brief.");
  });
  it("shows other ConvexError text", () => {
    expect(refusalText(new ConvexError("Media URL not reachable (404)."), "x")).toBe("Media URL not reachable (404).");
  });
  it("hides redacted server errors behind the fallback", () => {
    expect(refusalText(new Error("[CONVEX M(x:y)] Server Error"), "Try again.")).toBe("Try again.");
    expect(refusalCode(new Error("boom"))).toBeNull();
    expect(refusalText("nope", "Try again.")).toBe("Try again.");
  });
});
