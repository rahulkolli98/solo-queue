import { describe, expect, it } from "vitest";
import {
  enqueuePayloadSchema,
  nextDailyOccurrence,
  parseRefusal,
  refusal,
} from "../../convex/lib/slots";

describe("refusal / parseRefusal", () => {
  it("round-trips code and message", () => {
    const err = refusal("OVER_LIMIT", "Threads draft is 67 chars over.");
    expect(parseRefusal(err)).toEqual({
      code: "OVER_LIMIT",
      message: "Threads draft is 67 chars over.",
    });
  });

  it("tolerates Convex's action-error wrapping", () => {
    const wrapped = new Error(
      "[CONVEX A(slots:enqueue)] [Request ID: abc] Server Error Uncaught Error: VALIDATION:MEDIA_REQUIRED: IG drafts need a photo or video — attach media in the Library first. at handler (../convex/slots.ts:1:2) Called by client"
    );
    expect(parseRefusal(wrapped)).toEqual({
      code: "MEDIA_REQUIRED",
      message: "IG drafts need a photo or video — attach media in the Library first.",
    });
  });

  it("returns null for non-refusals", () => {
    expect(parseRefusal(new Error("boom"))).toBeNull();
    expect(parseRefusal("VALIDATION:X: y")).toBeNull();
  });
});

describe("enqueuePayloadSchema", () => {
  it("accepts a threads payload without media", () => {
    const r = enqueuePayloadSchema.safeParse({
      platform: "threads",
      text: "hello",
      scheduledAt: Date.now() + 1000,
    });
    expect(r.success).toBe(true);
  });

  it("accepts an instagram payload with media URL", () => {
    const r = enqueuePayloadSchema.safeParse({
      platform: "instagram",
      text: "caption",
      mediaUrl: "https://example.test/a.jpg",
      scheduledAt: 1893456000000,
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty text, bad URLs, and non-future timestamps", () => {
    expect(
      enqueuePayloadSchema.safeParse({ platform: "threads", text: "", scheduledAt: 1 }).success
    ).toBe(false);
    expect(
      enqueuePayloadSchema.safeParse({
        platform: "instagram",
        text: "c",
        mediaUrl: "not-a-url",
        scheduledAt: 1,
      }).success
    ).toBe(false);
    expect(
      enqueuePayloadSchema.safeParse({ platform: "blog", text: "x", scheduledAt: 1 }).success
    ).toBe(false);
  });
});

describe("nextDailyOccurrence", () => {
  // 2026-09-30 08:00 UTC
  const morning = Date.UTC(2026, 8, 30, 8, 0);

  it("picks today when the slot time is still ahead", () => {
    expect(nextDailyOccurrence("09:00", morning)).toBe(Date.UTC(2026, 8, 30, 9, 0));
  });

  it("rolls to tomorrow when the slot time has passed", () => {
    expect(nextDailyOccurrence("09:00", morning + 2 * 3600 * 1000)).toBe(
      Date.UTC(2026, 9, 1, 9, 0)
    );
  });

  it("rejects malformed times", () => {
    expect(() => nextDailyOccurrence("9am", morning)).toThrow();
  });
});
