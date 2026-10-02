import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { errorText } from "./errors";

describe("errorText", () => {
  it("reads the string payload of a ConvexError", () => {
    expect(errorText(new ConvexError("TEST_PUBLISH_DISABLED: off"), "x")).toBe(
      "TEST_PUBLISH_DISABLED: off"
    );
  });

  it("falls back to the message of a plain Error", () => {
    expect(errorText(new Error("boom"), "x")).toBe("boom");
  });

  it("does not use object payloads as the text, and uses the fallback for non-errors", () => {
    const text = errorText(new ConvexError({ code: 1 }), "fallback");
    expect(typeof text).toBe("string");
    expect(text.length).toBeGreaterThan(0);
    expect(errorText("nope", "fallback")).toBe("fallback");
    expect(errorText(undefined, "fallback")).toBe("fallback");
  });
});
