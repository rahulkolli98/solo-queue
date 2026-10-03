import { describe, expect, it } from "vitest";
import {
  angleLabel,
  briefParagraphs,
  detectCapture,
  linkTitle,
  numberWord,
  pickSelected,
  researchHeadline,
  shortAge,
  sourceSummary,
  splitTopics,
  topicMetaLine,
  wordCount,
} from "@/lib/researchBoard";

describe("detectCapture", () => {
  it("returns null for blank input", () => {
    expect(detectCapture("   ")).toBeNull();
  });
  it("treats a bare http(s) address as a link", () => {
    expect(detectCapture("https://developers.facebook.com/docs/threads")).toEqual({
      kind: "link",
      url: "https://developers.facebook.com/docs/threads",
    });
  });
  it("keeps a comment after the link", () => {
    expect(detectCapture("https://x.com/a/status/1 the token one")).toEqual({
      kind: "link",
      url: "https://x.com/a/status/1",
      text: "the token one",
    });
  });
  it("does not treat other schemes or bare words as links", () => {
    expect(detectCapture("ftp://x.com/file")?.kind).toBe("note");
    expect(detectCapture("example.com")?.kind).toBe("note");
  });
  it("detects a quoted line", () => {
    expect(detectCapture("“Hit the 60-day token wall on day 61.”")).toEqual({
      kind: "quote",
      text: "Hit the 60-day token wall on day 61.",
    });
    expect(detectCapture('"plain quotes too"')).toEqual({ kind: "quote", text: "plain quotes too" });
  });
  it("makes a note of a half-thought", () => {
    expect(detectCapture("  The token is the real limit.  ")).toEqual({
      kind: "note",
      text: "The token is the real limit.",
    });
  });
});

describe("researchHeadline", () => {
  it("counts ready topics in words", () => {
    expect(researchHeadline(4, 6)).toEqual({ before: "Four topics,", rust: "ripe", after: " for posting." });
    expect(researchHeadline(1, 6).before).toBe("One topic,");
  });
  it("says so when nothing is ripe", () => {
    expect(researchHeadline(0, 3)).toEqual({ before: "Nothing is", rust: "ripe", after: " yet." });
  });
  it("has an empty-inbox statement", () => {
    expect(researchHeadline(0, 0)).toEqual({ before: "Nothing saved", rust: "yet.", after: "" });
  });
  it("falls back to digits above twelve", () => {
    expect(numberWord(13)).toBe("13");
  });
});

describe("ages and labels", () => {
  const now = 1_000_000_000_000;
  it("shortens ages for mono labels", () => {
    expect(shortAge(now - 3000, now)).toBe("3S");
    expect(shortAge(now - 5 * 60_000, now)).toBe("5 M");
    expect(shortAge(now - 3 * 3_600_000, now)).toBe("3 H");
    expect(shortAge(now - 2 * 86_400_000, now)).toBe("2 D");
    expect(shortAge(now - 9 * 86_400_000, now)).toBe("1 W");
  });
  it("writes the row meta line", () => {
    expect(topicMetaLine(3, now - 2 * 86_400_000, now)).toBe("3 SOURCES · SAVED 2 D AGO");
    expect(topicMetaLine(1, now - 7 * 86_400_000, now)).toBe("1 SOURCE · SAVED 1 W AGO");
  });
  it("counts words", () => {
    expect(wordCount("  one two\nthree ")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
  it("splits a brief into paragraphs", () => {
    expect(briefParagraphs("A.\n\nB.\n \nC.")).toEqual(["A.", "B.", "C."]);
  });
  it("summarises sources apart from notes", () => {
    expect(sourceSummary([{ kind: "link" }, { kind: "quote" }, { kind: "screenshot" }, { kind: "note" }])).toBe(
      "3 sources · 1 note"
    );
    expect(sourceSummary([])).toBe("0 sources · 0 notes");
  });
  it("labels an angle with its frame", () => {
    const frames = [{ key: "hot-take", name: "Hot take" }];
    expect(angleLabel({ platform: "threads", format: "single", frameKey: "hot-take" }, frames)).toBe(
      "THREADS · SINGLE · HOT TAKE"
    );
    expect(angleLabel({ platform: "instagram", format: "reel", frameKey: "gone" }, frames)).toBe(
      "INSTAGRAM · REEL"
    );
  });
});

describe("linkTitle", () => {
  it("shows host and path without the scheme", () => {
    expect(linkTitle("https://www.developers.facebook.com/docs/threads/")).toBe("developers.facebook.com/docs/threads");
    expect(linkTitle("not a url")).toBe("not a url");
    expect(linkTitle("https://x.test/" + "a".repeat(80)).length).toBe(60);
  });
});

describe("topic list", () => {
  const rows = [
    { _id: "a", status: "ready" as const, pillar: "tools" },
    { _id: "b", status: "drafting" as const, pillar: "build" },
    { _id: "c", status: "done" as const, pillar: "build" },
    { _id: "d", status: "queued" as const, pillar: undefined },
  ];
  it("moves queued and done topics to the sent box", () => {
    const { active, sent, activeTotal } = splitTopics(rows, null);
    expect(active.map((t) => t._id)).toEqual(["a", "b"]);
    expect(sent.map((t) => t._id)).toEqual(["c", "d"]);
    expect(activeTotal).toBe(2);
  });
  it("filters by pillar but keeps the unfiltered total", () => {
    const { active, sent, activeTotal } = splitTopics(rows, "build");
    expect(active.map((t) => t._id)).toEqual(["b"]);
    expect(sent.map((t) => t._id)).toEqual(["c"]);
    expect(activeTotal).toBe(2);
  });
  it("selects the requested topic, else the first listed", () => {
    expect(pickSelected(rows, "c", [rows[0]])?._id).toBe("c");
    expect(pickSelected(rows, "zzz", [rows[1]])?._id).toBe("b");
    expect(pickSelected(rows, null, [])?._id).toBe("a");
    expect(pickSelected([], null, [])).toBeNull();
  });
});
