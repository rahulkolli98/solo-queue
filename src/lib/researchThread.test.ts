import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { refusalCode, refusalText } from "@/lib/refusalText";
import {
  displayTz,
  postsOf,
  queuedForText,
  saveState,
  sendToStudioNote,
  threadBody,
  threadChanged,
  threadChecks,
} from "@/lib/researchThread";

const post = (n: number) => "a".repeat(n);

describe("threadChecks", () => {
  it("blocks saving and queueing an empty thread, with a reason", () => {
    for (const posts of [[""], ["  ", "\n"]]) {
      const c = threadChecks(posts);
      expect(c.canSave).toBe(false);
      expect(c.canQueue).toBe(false);
      expect(c.saveReason).toBe("Write at least one post first.");
      expect(c.queueReason).toBe(c.saveReason);
      expect(c.postCount).toBe(0);
    }
  });

  it("allows a thread whose posts all fit", () => {
    const c = threadChecks([post(500), "second", ""]);
    expect(c).toMatchObject({ canSave: true, canQueue: true, saveReason: null, queueReason: null, postCount: 2 });
    expect(c.overPosts).toEqual([]);
  });

  it("names the post that is over the limit, saves anyway, and blocks queueing", () => {
    const c = threadChecks(["fine", post(537)]);
    expect(c.canSave).toBe(true);
    expect(c.canQueue).toBe(false);
    expect(c.overPosts).toEqual([{ number: 2, over: 37 }]);
    expect(c.queueReason).toBe("Post 2 is 37 characters over the 500 limit. Shorten it to queue.");
  });

  it("lists several over-long posts", () => {
    expect(threadChecks([post(501), "ok", post(502), post(503)]).queueReason).toBe(
      "Posts 1, 3 and 4 are over the 500 character limit. Shorten them to queue."
    );
    expect(threadChecks([post(501), post(502)]).queueReason).toContain("Posts 1 and 2 are over");
  });

  it("counts the trimmed post, and emoji as one character each", () => {
    expect(threadChecks([`  ${post(500)}  `]).canQueue).toBe(true);
    expect(threadChecks(["😀".repeat(500)]).canQueue).toBe(true);
    expect(threadChecks(["😀".repeat(501)]).canQueue).toBe(false);
  });

  it("blocks both saving and queueing past 25 posts", () => {
    const c = threadChecks(Array.from({ length: 26 }, (_, i) => `post ${i}`));
    expect(c.canSave).toBe(false);
    expect(c.canQueue).toBe(false);
    expect(c.saveReason).toBe("A thread can have at most 25 posts. This one has 26. Remove 1.");
    expect(threadChecks(Array.from({ length: 25 }, (_, i) => `post ${i}`)).canQueue).toBe(true);
  });

  it("does not count empty posts toward the 25", () => {
    const posts = [...Array.from({ length: 25 }, (_, i) => `p${i}`), "", ""];
    expect(threadChecks(posts).canSave).toBe(true);
  });
});

describe("stored text", () => {
  it("joins tidy posts with --- lines and drops empty ones", () => {
    expect(threadBody([" one ", "", "two"])).toBe("one\n---\ntwo");
  });

  it("shows one empty post when nothing is stored", () => {
    expect(postsOf(undefined)).toEqual([""]);
    expect(postsOf("  ")).toEqual([""]);
    expect(postsOf("a\n---\nb")).toEqual(["a", "b"]);
  });

  it("treats an added empty post or stray whitespace as no change", () => {
    expect(threadChanged(["a", "b", ""], "a\n---\nb")).toBe(false);
    expect(threadChanged([" a ", "b"], "a\n---\nb")).toBe(false);
    expect(threadChanged([""], "")).toBe(false);
  });

  it("sees an edited, added, removed or reordered post as a change", () => {
    expect(threadChanged(["a", "B"], "a\n---\nb")).toBe(true);
    expect(threadChanged(["a"], "a\n---\nb")).toBe(true);
    expect(threadChanged(["b", "a"], "a\n---\nb")).toBe(true);
    expect(threadChanged(["a"], "")).toBe(true);
  });
});

describe("save state", () => {
  it("says Saved, Unsaved changes, Saving and Not saved yet", () => {
    expect(saveState({ hasDraft: true, changed: false, saving: false })).toBe("saved");
    expect(saveState({ hasDraft: true, changed: true, saving: false })).toBe("unsaved");
    expect(saveState({ hasDraft: true, changed: true, saving: true })).toBe("saving");
    expect(saveState({ hasDraft: false, changed: false, saving: false })).toBe("empty");
    expect(saveState({ hasDraft: false, changed: true, saving: false })).toBe("unsaved");
  });
});

describe("Send to Studio note", () => {
  it("says the written thread is already there", () => {
    expect(sendToStudioNote(true)).toBe("Opens this topic in Studio with your thread already there.");
  });
  it("says Generate drafts or write it yourself when there is no thread", () => {
    expect(sendToStudioNote(false)).toBe(
      "Opens this topic in Studio. Press Generate drafts to have a thread, reel script and caption written, or write the thread yourself."
    );
  });
});

describe("queued time", () => {
  it("shows the slot in the founder's zone", () => {
    const at = Date.UTC(2026, 9, 5, 13, 30); // Mon 5 Oct 2026
    expect(queuedForText(at, "Asia/Kolkata")).toBe("Queued for Mon 5 Oct, 19:00");
    expect(queuedForText(at, "UTC")).toBe("Queued for Mon 5 Oct, 13:30");
  });
  it("uses the browser zone when the setting is auto", () => {
    expect(displayTz("auto", "Europe/London")).toBe("Europe/London");
    expect(displayTz(undefined, "Europe/London")).toBe("Europe/London");
    expect(displayTz("Asia/Kolkata", "Europe/London")).toBe("Asia/Kolkata");
  });
});

describe("queue refusals reach the screen as the backend wrote them", () => {
  const cases: [string, string][] = [
    ["OVER_LIMIT", "Threads draft is 37 chars over the 500-per-post limit — shorten it to queue."],
    ["PLACEHOLDER", "This draft still has a [[placeholder]] to fill in. Replace or delete it before queueing."],
    ["ALREADY_QUEUED", "This draft is already queued."],
    ["TOO_MANY_POSTS", "This thread has 26 posts. The most one thread can have is 25."],
    ["NO_FREE_SLOT", "No free slot in the next year."],
  ];
  it.each(cases)("%s", (code, message) => {
    const err = new ConvexError(`VALIDATION:${code}: ${message}`);
    expect(refusalText(err, "Couldn't queue this thread. Try again.")).toBe(message);
    expect(refusalCode(err)).toBe(code);
  });
  it("falls back to a plain sentence for an unreadable server error", () => {
    expect(
      refusalText(new Error("[CONVEX M(slots:enqueue)] Server Error"), "Couldn't queue this thread. Try again.")
    ).toBe("Couldn't queue this thread. Try again.");
  });
});
