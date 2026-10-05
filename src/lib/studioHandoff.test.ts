import { describe, expect, it } from "vitest";
import {
  fillBanner,
  fillSlotLabel,
  parseFillSlot,
  researchBanner,
  studioFillHref,
  studioTopicHref,
} from "@/lib/studioHandoff";

describe("open slot -> Studio hand-off", () => {
  it("builds a link that names the day, time and platform", () => {
    const href = studioFillHref({ dayKey: "2026-10-03", time: "09:30", platform: "threads" });
    expect(href).toBe("/studio?fillDay=2026-10-03&fillTime=09%3A30&fillOn=threads");
  });

  it("round-trips through the parser", () => {
    const href = studioFillHref({ dayKey: "2026-10-03", time: "09:30", platform: "instagram" });
    const params = Object.fromEntries(new URL(href, "http://x").searchParams);
    expect(parseFillSlot(params)).toEqual({ dayKey: "2026-10-03", time: "09:30", platform: "instagram" });
  });

  it("ignores a missing or malformed query", () => {
    expect(parseFillSlot(undefined)).toBeNull();
    expect(parseFillSlot({})).toBeNull();
    expect(parseFillSlot({ fillDay: "tomorrow" })).toBeNull();
    expect(parseFillSlot({ fillDay: "2026-10-03", fillTime: "25:99", fillOn: "tiktok" })).toEqual({
      dayKey: "2026-10-03",
      time: undefined,
      platform: undefined,
    });
    expect(parseFillSlot({ fillDay: ["2026-10-03", "x"] })?.dayKey).toBe("2026-10-03");
  });

  it("says which slot is being filled and what to do", () => {
    const slot = { dayKey: "2026-10-03", time: "09:30", platform: "threads" as const };
    expect(fillSlotLabel(slot)).toBe("Sat 3 Oct, 09:30 on Threads");
    const banner = fillBanner(slot);
    expect(banner.title).toBe("Filling Sat 3 Oct, 09:30 on Threads.");
    expect(banner.detail).toContain("Pick a topic from your inbox below and press Draft or Write, or add a new one.");
    // queueing is not promised to land in this exact slot
    expect(banner.detail).toContain("next free slots in order");
  });

  it("a whole-day link says so", () => {
    expect(fillBanner({ dayKey: "2026-10-03" }).title).toBe("Filling an open slot on Sat 3 Oct.");
  });
});

describe("Research -> Studio hand-off", () => {
  it("links to the topic with a marker", () => {
    expect(studioTopicHref("abc", "research")).toBe("/studio/abc?from=research");
    expect(studioTopicHref("abc")).toBe("/studio/abc");
  });

  it("explains what happens next, with and without drafts", () => {
    expect(researchBanner(false).detail).toContain("Press Generate drafts");
    expect(researchBanner(true).detail).toContain("Your thread is here as the Threads draft");
    expect(researchBanner(false).detail).toContain("press Write it myself");
  });
});
