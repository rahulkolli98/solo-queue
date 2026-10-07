import { describe, expect, it } from "vitest";
import { draftMeta, postcardMeta } from "@/lib/libraryBoard";
import { slotCardLabel } from "@/lib/queueA11y";
import {
  barSummary,
  carouselMediaState,
  draftsNeedingFix,
  queueKindsOf,
  readiness,
  studioGuide,
  type DraftKind,
  type ReadyState,
  type Readiness,
} from "@/lib/studioModel";

const NOW = 1_000_000_000_000;
const DAY = 86_400_000;
const r = (state: ReadyState): Readiness => ({ state, overBy: 0, reason: "" });

describe("carouselMediaState", () => {
  const draft = (ids: string[], slides = ids.length) => ({ slides: Array.from({ length: slides }, () => ({})), mediaAssetIds: ids });
  const assets = (map: Record<string, number | undefined>) => new Map(Object.entries(map).map(([id, verifiedAt]) => [id, { verifiedAt }]));

  it("is ok when every slide has a stored image checked within a day", () => {
    expect(carouselMediaState(draft(["a", "b"]), assets({ a: NOW - 1000, b: NOW - 2000 }), NOW)).toBe("ok");
  });
  it("is none with no images or a different number of images than slides", () => {
    expect(carouselMediaState(draft([], 3), assets({}), NOW)).toBe("none");
    expect(carouselMediaState(draft(["a", "b"], 3), assets({ a: NOW, b: NOW }), NOW)).toBe("none");
    expect(carouselMediaState(undefined, assets({}), NOW)).toBe("none");
  });
  it("reports the worst image: missing, then unchecked, then stale", () => {
    expect(carouselMediaState(draft(["a", "b"]), assets({ a: NOW }), NOW)).toBe("missing");
    expect(carouselMediaState(draft(["a", "b"]), assets({ a: NOW, b: undefined }), NOW)).toBe("unverified");
    expect(carouselMediaState(draft(["a", "b"]), assets({ a: NOW, b: NOW - 2 * DAY }), NOW)).toBe("stale");
    expect(carouselMediaState(draft(["a", "b"]), assets({ a: NOW - 2 * DAY, b: undefined }), NOW)).toBe("unverified");
  });
  it("a carousel is ready to queue when its caption is fine and its images are ok", () => {
    expect(readiness({ kind: "carousel", body: "A caption", media: "ok" }).state).toBe("ready");
    expect(readiness({ kind: "carousel", body: "A caption", media: "none" }).state).toBe("media_required");
    expect(readiness({ kind: "carousel", body: "x".repeat(2300), media: "ok" }).state).toBe("over");
  });
});

describe("a topic's carousel in the queue summary and the guide", () => {
  const states = (carousel?: ReadyState): Partial<Record<DraftKind, Readiness>> => ({
    threads: r("ready"),
    caption: r("ready"),
    reel: r("ready"),
    ...(carousel ? { carousel: r(carousel) } : {}),
  });

  it("only takes part when the topic has one", () => {
    expect(queueKindsOf(states())).toEqual(["threads", "caption", "reel"]);
    expect(queueKindsOf(states("ready"))).toEqual(["threads", "caption", "reel", "carousel"]);
  });

  it("counts a ready carousel in the Queue button and a carousel without images as needing a fix", () => {
    const base = { generating: false, emptySub: "" };
    expect(barSummary({ ...base, states: states() }).buttonLabel).toBe("Queue 3 posts");
    expect(barSummary({ ...base, states: states("ready") }).buttonLabel).toBe("Queue 4 posts");
    expect(draftsNeedingFix(states("media_required"))).toEqual(["carousel"]);
    expect(draftsNeedingFix(states("ready"))).toEqual([]);
  });

  it("tells the founder what to do about the carousel's images, in its own words", () => {
    const g = (c: ReadyState) => studioGuide({ generating: false, generationFailed: false, manualText: false, hasOpenSlot: true, states: states(c) }).text.toLowerCase();
    expect(g("media_required")).toContain("open the carousel tab and press draw the slides");
    expect(g("media_missing")).toContain("a slide image of the carousel is gone");
    expect(g("media_stale")).toContain("press check the images on the carousel tab");
    expect(g("media_unverified")).toContain("press check the images on the carousel tab");
    expect(g("media_required")).not.toContain("attach a photo or video to the carousel");
  });
});

describe("labels", () => {
  it("a carousel says how many slides it has on Library cards and in the queue", () => {
    expect(draftMeta("instagram", "carousel", 6)).toBe("CAROUSEL · 6 SLIDES");
    expect(draftMeta("instagram", "carousel", 1)).toBe("CAROUSEL · 1 SLIDE");
    expect(draftMeta("instagram", "carousel")).toBe("CAROUSEL");
    expect(draftMeta("instagram", "reel", 6)).toBe("REEL");
    expect(postcardMeta({ platform: "instagram", format: "carousel", slideCount: 4, publishedAt: Date.UTC(2026, 9, 5) }, "UTC")).toMatch(/^CAROUSEL · 4 SLIDES · /);
    const card = { platform: "instagram" as const, format: "carousel", slideCount: 6, time: "12:00", topicTitle: "T", status: "scheduled" as const };
    expect(slotCardLabel(card, "Tue 6 Oct")).toContain("Instagram carousel of 6 slides on Tue 6 Oct");
    expect(slotCardLabel({ ...card, slideCount: 1 }, "Tue 6 Oct")).toContain("carousel of 1 slide ");
  });
});
