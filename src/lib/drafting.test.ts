import { describe, expect, it } from "vitest";
import {
  buildTopicVars,
  captionConstraint,
  checkEditedBody,
  fillSlots,
  plainConstraint,
  splitPosts,
  stripBeatHeaders,
  threadsConstraint,
} from "../../convex/lib/drafting";

describe("fillSlots", () => {
  it("substitutes known slots and leaves unknown ones intact", () => {
    expect(fillSlots("Hi {{topic}} from {{pillar}} {{oops}}", { topic: "T", pillar: "P" })).toBe(
      "Hi T from P {{oops}}"
    );
  });

  it("tolerates whitespace inside braces", () => {
    expect(fillSlots("A{{ notes }}B", { notes: "n" })).toBe("AnB");
  });
});

describe("buildTopicVars", () => {
  it("defaults pillar/notes/sources when absent", () => {
    expect(buildTopicVars({ title: "T" })).toEqual({
      topic: "T",
      pillar: "build in public",
      notes: "(no notes — work from the topic alone)",
      sources: "(no linked sources)",
    });
  });

  it("trims and passes through provided values", () => {
    expect(
      buildTopicVars({ title: "  T  ", pillar: " AI & tools ", notes: "n", sourceUrl: "https://x.test/a" })
    ).toEqual({ topic: "  T  ", pillar: "AI & tools", notes: "n", sources: "https://x.test/a" });
  });
});

describe("splitPosts", () => {
  it("splits on standalone --- lines and drops empties", () => {
    expect(splitPosts("HOOK · 10 / 500\none\n---\nTURN · 8 / 500\ntwo\n---\n")).toEqual([
      "HOOK · 10 / 500\none",
      "TURN · 8 / 500\ntwo",
    ]);
  });

  it("returns one part when no separator exists", () => {
    expect(splitPosts("just text")).toEqual(["just text"]);
  });
});

describe("threadsConstraint", () => {
  it("passes when every post fits and reports the longest", () => {
    const body = "a".repeat(100) + "\n---\n" + "b".repeat(400);
    const r = threadsConstraint(body);
    expect(r.constraintOk).toBe(true);
    expect(r.charCount).toBe(400);
  });

  it("fails when any post exceeds 500", () => {
    expect(threadsConstraint("ok\n---\n" + "x".repeat(501)).constraintOk).toBe(false);
  });
});

describe("captionConstraint", () => {
  it("passes at or under 2200 chars", () => {
    expect(captionConstraint("x".repeat(2200)).constraintOk).toBe(true);
    expect(captionConstraint("x".repeat(2201)).constraintOk).toBe(false);
  });
});

describe("plainConstraint", () => {
  it("always passes and counts trimmed length", () => {
    expect(plainConstraint("  abc  ")).toEqual({ charCount: 3, constraintOk: true });
  });
});

describe("checkEditedBody", () => {
  it("uses the threads mapping for threads drafts", () => {
    expect(checkEditedBody("threads", "threads-hook-story", "a".repeat(501)).constraintOk).toBe(false);
    expect(checkEditedBody("threads", "threads-hook-story", "short").constraintOk).toBe(true);
  });

  it("uses the 2200 cap only for IG captions", () => {
    expect(checkEditedBody("instagram", "ig-caption-beats", "x".repeat(2201)).constraintOk).toBe(false);
    expect(checkEditedBody("instagram", "reel-script", "x".repeat(5000)).constraintOk).toBe(true);
  });

  it("leaves blog drafts unconstrained", () => {
    expect(checkEditedBody("blog", "blog-draft", "x".repeat(9000))).toEqual({
      charCount: 9000,
      constraintOk: true,
    });
  });
});

describe("stripBeatHeaders", () => {
  it("drops the beat label line above each post and keeps the posts", () => {
    const body =
      "ADMIT · 76 / 500\nI hid how much I paid.\n---\nTURN · 120 / 500\nThen I switched.\n---\nCLOSE · 40 / 500\nDay 4.";
    expect(stripBeatHeaders(body)).toBe("I hid how much I paid.\n---\nThen I switched.\n---\nDay 4.");
  });

  it("copes with bold labels and other separators", () => {
    expect(stripBeatHeaders("**HOOK · 117 / 500**\nFirst.\n---\nPAYOFF | 33 / 500\nSecond.")).toBe(
      "First.\n---\nSecond."
    );
  });

  it("leaves posts without a label untouched, including prose that mentions a count", () => {
    const body = "I posted 3 / 7 days.\nStill going.\n---\nSecond post.";
    expect(stripBeatHeaders(body)).toBe(body);
  });

  it("drops a post that was only a label", () => {
    expect(stripBeatHeaders("HOOK · 5 / 500\n---\nReal post.")).toBe("Real post.");
  });
});
