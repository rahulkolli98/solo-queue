import { describe, expect, it } from "vitest";
import {
  countWord,
  draftsNeedingFix,
  fixHeadline,
  instagramFooter,
  platformNeedsText,
  type DraftKind,
  type ReadyState,
  type Readiness,
} from "@/lib/studioModel";

const r = (state: ReadyState): Readiness => ({ state, overBy: 0, reason: "" });

describe("draftsNeedingFix", () => {
  it("counts the drafts that block queueing: over the limit, media required / missing / unverified / stale", () => {
    expect(draftsNeedingFix({ threads: r("over"), caption: r("media_required"), reel: r("media_stale") })).toEqual([
      "threads",
      "caption",
      "reel",
    ]);
    expect(draftsNeedingFix({ threads: r("ready"), caption: r("media_missing"), reel: r("media_unverified") })).toEqual([
      "caption",
      "reel",
    ]);
  });

  it("does not count ready, queued or not-yet-written drafts", () => {
    expect(draftsNeedingFix({ threads: r("ready"), caption: r("queued"), reel: r("missing") })).toEqual([]);
    expect(draftsNeedingFix({})).toEqual([]);
  });

  it("counts a failed write that left no draft, but not a failure that left an old draft", () => {
    const errored: DraftKind[] = ["reel", "threads"];
    expect(draftsNeedingFix({ threads: r("ready"), caption: r("ready"), reel: r("missing") }, errored)).toEqual(["reel"]);
    expect(draftsNeedingFix({ caption: r("ready") }, errored)).toEqual(["threads", "reel"]);
  });
});

describe("fixHeadline", () => {
  it("spells the count out up to ten", () => {
    expect(fixHeadline(2)).toEqual({ lead: "two drafts need a", accent: "fix." });
    expect(fixHeadline(3).lead).toBe("three drafts need a");
    expect(countWord(10)).toBe("ten");
  });

  it("is singular for one and uses the digit past ten", () => {
    expect(fixHeadline(1)).toEqual({ lead: "one draft needs a", accent: "fix." });
    expect(fixHeadline(11).lead).toBe("11 drafts need a");
  });
});

describe("platform copy", () => {
  it("words the phone notice and the Instagram footer for one and many", () => {
    expect(platformNeedsText("Instagram", 2)).toBe("Instagram: 2 drafts need you");
    expect(platformNeedsText("Threads", 1)).toBe("Threads: 1 draft needs you");
    expect(instagramFooter(2)).toBe("2 INSTAGRAM DRAFTS NEED YOU");
    expect(instagramFooter(1)).toBe("1 INSTAGRAM DRAFT NEEDS YOU");
  });
});
