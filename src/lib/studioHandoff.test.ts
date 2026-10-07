import { describe, expect, it } from "vitest";
import {
  fillBanner,
  fillSlotLabel,
  parseFillSlot,
  angleBanner,
  angleSetup,
  parseAngle,
  researchBanner,
  studioAngleHref,
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

describe("Draft this on an angle card", () => {
  it("maps an angle to the Studio format it drafts by platform and format, and the carousel to none", () => {
    expect(angleSetup({ platform: "threads", format: "thread", frameKey: "confession" })).toEqual({ kind: "threads", frameKey: "confession" });
    // A single post on Threads is a Threads post; a single on Instagram is a caption.
    expect(angleSetup({ platform: "threads", format: "single", frameKey: "hot-take" })?.kind).toBe("threads");
    expect(angleSetup({ platform: "instagram", format: "single", frameKey: "receipt" })?.kind).toBe("caption");
    expect(angleSetup({ platform: "instagram", format: "caption", frameKey: "receipt" })?.kind).toBe("caption");
    expect(angleSetup({ platform: "instagram", format: "reel", frameKey: "teardown" })?.kind).toBe("reel");
    expect(angleSetup({ platform: "instagram", format: "carousel", frameKey: "receipt" })).toBeNull();
  });

  it("builds a Studio link that names the Studio format and frame and never asks for generation", () => {
    const href = studioAngleHref("abc123", { platform: "instagram", format: "reel", frameKey: "teardown" });
    expect(href).toBe("/studio/abc123?from=research&angle=reel&frame=teardown");
    expect(href).not.toContain("draft=1");
    expect(studioAngleHref("abc123", { platform: "threads", format: "single", frameKey: "hot-take" })).toBe("/studio/abc123?from=research&angle=threads&frame=hot-take");
    expect(studioAngleHref("abc123", { platform: "instagram", format: "carousel", frameKey: "receipt" })).toBeNull();
    // A frame key that is not a plain key is left out of the link.
    expect(studioAngleHref("abc123", { platform: "threads", format: "thread", frameKey: "Bad Key&x=1" })).toBe("/studio/abc123?from=research&angle=threads");
  });

  it("reads the angle back from the query, ignoring unknown formats and odd frame keys", () => {
    const q = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
    expect(parseAngle(q({ angle: "caption", frame: "receipt" }))).toEqual({ kind: "caption", frameKey: "receipt" });
    expect(parseAngle(q({ angle: "threads" }))).toEqual({ kind: "threads", frameKey: undefined });
    expect(parseAngle(q({ angle: "threads", frame: "../x" }))).toEqual({ kind: "threads", frameKey: undefined });
    expect(parseAngle(q({ angle: "carousel" }))).toBeNull();
    expect(parseAngle(q({ angle: "thread" }))).toBeNull();
    expect(parseAngle(q({}))).toBeNull();
  });

  it("the banner says what will be drafted", () => {
    expect(angleBanner("caption").detail).toContain("Drafting just the caption for this angle");
  });
});
