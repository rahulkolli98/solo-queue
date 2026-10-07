import { describe, expect, it } from "vitest";
import { MAX_THREAD_POSTS, serializeThread } from "@/lib/draftText";
import {
  POSTS_FALLBACK,
  POSTS_MAX,
  POSTS_MIN,
  addToThread,
  clampPosts,
  generateArgs,
  kindsAtRisk,
  moveInThread,
  postsLabel,
  removeConfirmText,
  removeFromThread,
  replaceQuestion,
  studioEntry,
} from "@/lib/studioCompose";

const params = (q: Record<string, string>) => ({ get: (k: string) => q[k] ?? null });

describe("post counts", () => {
  it("keeps the count inside what the backend accepts", () => {
    expect(clampPosts(1)).toBe(POSTS_MIN);
    expect(clampPosts(40)).toBe(POSTS_MAX);
    expect(clampPosts(6)).toBe(6);
    expect(clampPosts(5.6)).toBe(6);
    expect(clampPosts(Number.NaN)).toBe(POSTS_FALLBACK);
  });

  it("labels the thread length against the 25 post limit", () => {
    expect(postsLabel(6)).toBe("6 / 25 posts");
    expect(postsLabel(MAX_THREAD_POSTS)).toBe("25 / 25 posts");
  });
});

describe("removeConfirmText (what a screen reader hears while Remove waits for its second press)", () => {
  it("names the post and says how to back out, and is silent otherwise", () => {
    expect(removeConfirmText(3, true)).toBe("Press Remove again to delete post 3. Moving off this button keeps it.");
    expect(removeConfirmText(3, false)).toBe("");
  });
});

describe("generateArgs (what drafting.generate receives)", () => {
  it("sends only the formats and no setup when nothing was chosen", () => {
    const args = generateArgs({ topicId: "t1", kinds: ["threads", "caption", "reel"] });
    expect(args).toEqual({ topicId: "t1", formats: ["threads", "instagram-caption", "instagram-reel"] });
    expect("setup" in args).toBe(false);
  });

  it("names each format's story frame", () => {
    const args = generateArgs({
      topicId: "t1",
      kinds: ["threads", "caption", "reel"],
      setup: { threads: { frameKey: "confession", count: 6 }, caption: { frameKey: "receipt" }, reel: { frameKey: "teardown" } },
    });
    expect(args.setup).toEqual({
      threads: { frameKey: "confession", count: 6 },
      caption: { frameKey: "receipt" },
      reel: { frameKey: "teardown" },
    });
  });

  it("drops choices for formats this run does not write", () => {
    const args = generateArgs({ topicId: "t1", kinds: ["caption"], setup: { threads: { frameKey: "confession", count: 6 }, caption: { frameKey: "receipt" } } });
    expect(args.formats).toEqual(["instagram-caption"]);
    expect(args.setup).toEqual({ caption: { frameKey: "receipt" } });
  });

  it("sends the carousel frame and slide count, clamped to 4 to 10, only when a carousel is written", () => {
    const args = generateArgs({ topicId: "t1", kinds: ["carousel"], setup: { carousel: { frameKey: "ig-carousel", count: 40 } } });
    expect(args.formats).toEqual(["instagram-carousel"]);
    expect(args.setup).toEqual({ carousel: { frameKey: "ig-carousel", count: 10 } });
    expect(generateArgs({ topicId: "t1", kinds: ["threads"], setup: { carousel: { frameKey: "ig-carousel" } } }).setup).toBeUndefined();
  });

  it("clamps an out-of-range count", () => {
    expect(generateArgs({ topicId: "t1", kinds: ["threads"], setup: { threads: { count: 50 } } }).setup?.threads?.count).toBe(POSTS_MAX);
  });
});

describe("studioEntry (what the query string may start)", () => {
  it("?draft=1 generates, but only for a topic with no drafts", () => {
    expect(studioEntry(params({ draft: "1" }), 0)).toEqual({ write: false, generate: true });
    expect(studioEntry(params({ draft: "1" }), 2).generate).toBe(false);
  });

  it("?write=1 opens the writer and never generates", () => {
    expect(studioEntry(params({ write: "1" }), 0)).toEqual({ write: true, generate: false });
  });

  it("?from=research never generates", () => {
    expect(studioEntry(params({ from: "research" }), 0)).toEqual({ write: false, generate: false });
    expect(studioEntry(params({ write: "1", from: "research" }), 3).generate).toBe(false);
  });
});

describe("editing a saved thread", () => {
  const body = serializeThread(["one", "two", "three"]);

  it("adds an empty post at the end", () => {
    expect(addToThread(body)).toBe(serializeThread(["one", "two", "three", ""]));
  });

  it("stops adding at 25 posts", () => {
    const full = serializeThread(Array.from({ length: MAX_THREAD_POSTS }, (_, i) => `p${i}`));
    expect(addToThread(full)).toBe(full);
  });

  it("removes one post and keeps the order of the rest", () => {
    expect(removeFromThread(body, 1)).toBe(serializeThread(["one", "three"]));
  });

  it("empties the only post instead of removing it, and ignores a bad index", () => {
    expect(removeFromThread("only", 0)).toBe("");
    expect(removeFromThread("only", 3)).toBe("only");
  });

  it("moves a post up or down, and not past either end", () => {
    expect(moveInThread(body, 2, -1)).toBe(serializeThread(["one", "three", "two"]));
    expect(moveInThread(body, 0, 1)).toBe(serializeThread(["two", "one", "three"]));
    expect(moveInThread(body, 0, -1)).toBe(body);
    expect(moveInThread(body, 2, 1)).toBe(body);
  });
});

describe("the replace question", () => {
  it("names the thread as the thing being replaced", () => {
    expect(replaceQuestion(["threads"])).toBe("This replaces the thread you have written. Replace it?");
  });

  it("lists several drafts", () => {
    expect(replaceQuestion(["threads", "caption", "reel"])).toBe(
      "This replaces the thread, caption and reel script you have. Replace them?"
    );
  });

  it("is empty when nothing would be replaced", () => {
    expect(replaceQuestion([])).toBe("");
  });

  it("counts drafts that exist and a thread still being typed in the writer", () => {
    expect(kindsAtRisk(["threads", "caption", "reel"], {}, false)).toEqual([]);
    expect(kindsAtRisk(["threads", "caption", "reel"], {}, true)).toEqual(["threads"]);
    expect(kindsAtRisk(["threads", "caption", "reel"], { caption: {}, threads: {} }, false)).toEqual([
      "threads",
      "caption",
    ]);
    expect(kindsAtRisk(["caption"], { threads: {} }, false)).toEqual([]);
  });
});
