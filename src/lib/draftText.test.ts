import { describe, expect, it } from "vitest";
import {
  charLen,
  cleanThread,
  markdownFilename,
  overPostCount,
  parseReelScript,
  parseThread,
  postLength,
  serializeThread,
  splitInTwo,
  threadOverBy,
  trimToFit,
  wordCount,
} from "@/lib/draftText";

describe("charLen", () => {
  it("counts emoji as one character, not two UTF-16 units", () => {
    expect("a🙂b".length).toBe(4);
    expect(charLen("a🙂b")).toBe(3);
    expect(charLen("")).toBe(0);
  });
});

describe("thread posts", () => {
  it("splits on lines holding only ---, with no beat headers", () => {
    expect(parseThread("one\n---\ntwo\n---\nthree")).toEqual(["one", "two", "three"]);
  });

  it("round-trips the stored form", () => {
    const body = "one\n---\ntwo";
    expect(serializeThread(parseThread(body))).toBe(body);
  });

  it("keeps empty posts while editing and drops them when cleaned", () => {
    const posts = parseThread("one\n---\n\n---\nthree");
    expect(posts).toEqual(["one", "", "three"]);
    expect(cleanThread(["  one ", "", "three\n"])).toEqual(["one", "three"]);
  });

  it("treats --- inside a line as text, and tolerates spaces and CRLF", () => {
    expect(parseThread("a --- b")).toEqual(["a --- b"]);
    expect(parseThread("a\r\n  ---  \r\nb")).toEqual(["a", "b"]);
  });

  it("measures the trimmed post and reports how far the longest is over", () => {
    const posts = ["x".repeat(538), "short"];
    expect(postLength("  abc  ")).toBe(3);
    expect(threadOverBy(posts)).toBe(38);
    expect(overPostCount(posts)).toBe(1);
    expect(threadOverBy(["x".repeat(500)])).toBe(0);
    expect(threadOverBy(["x".repeat(500) + "🙂"])).toBe(1);
  });
});

describe("trimToFit", () => {
  const sentence = "This is a sentence that keeps going and going. ";

  it("returns text that already fits, trimmed", () => {
    expect(trimToFit("  fits  ", 500)).toBe("fits");
  });

  it("cuts at the last sentence end inside the limit", () => {
    const text = sentence.repeat(14); // ~660 chars
    const out = trimToFit(text, 500);
    expect(charLen(out)).toBeLessThanOrEqual(500);
    expect(out.endsWith(".")).toBe(true);
  });

  it("falls back to a word boundary with an ellipsis", () => {
    const text = "word ".repeat(200);
    const out = trimToFit(text, 100);
    expect(charLen(out)).toBeLessThanOrEqual(100);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });

  it("hard-cuts one very long word within the limit", () => {
    const out = trimToFit("x".repeat(700), 500);
    expect(charLen(out)).toBe(500);
    expect(out.endsWith("…")).toBe(true);
  });

  it("never splits an emoji", () => {
    const out = trimToFit("🙂".repeat(600), 500);
    expect(charLen(out)).toBeLessThanOrEqual(500);
    expect(out).not.toContain("\ud83d\u0000");
  });
});

describe("splitInTwo", () => {
  it("splits at the sentence end nearest the middle", () => {
    const [a, b] = splitInTwo("First part is here. Second part is a bit longer than the first one is.");
    expect(a).toBe("First part is here.");
    expect(b.startsWith("Second part")).toBe(true);
  });

  it("splits at a space when there is no sentence end", () => {
    const parts = splitInTwo("one two three four five six");
    expect(parts).toHaveLength(2);
    expect(parts.join(" ")).toBe("one two three four five six");
  });

  it("leaves text it cannot split", () => {
    expect(splitInTwo("single")).toEqual(["single"]);
    expect(splitInTwo("x")).toEqual(["x"]);
  });
});

describe("parseReelScript", () => {
  const body = [
    "1. 0:00–0:02 — On screen: “My app charged me to use my app.”",
    "2. 0:02–0:08 — VO: I built a scheduler.",
    "3. 0:08–0:18 — B-roll: invoice scroll.",
    "---",
    "I was paying my own product.",
  ].join("\n");

  it("reads timed scenes with their labels and the caption after ---", () => {
    const script = parseReelScript(body);
    expect(script?.scenes).toHaveLength(3);
    expect(script?.scenes[0]).toEqual({
      time: "0:00–0:02",
      label: "On screen",
      text: "“My app charged me to use my app.”",
    });
    expect(script?.scenes[2].label).toBe("B-roll");
    expect(script?.caption).toBe("I was paying my own product.");
  });

  it("returns null for free text", () => {
    expect(parseReelScript("just some words")).toBeNull();
  });
});

describe("markdownFilename", () => {
  it("slugs the title and adds the date", () => {
    expect(markdownFilename("Per-post API fees quietly tax consistency!", new Date("2026-10-01T10:00:00Z"))).toBe(
      "per-post-api-fees-quietly-tax-consistency-2026-10-01.md"
    );
  });

  it("falls back to draft", () => {
    expect(markdownFilename("!!!", new Date("2026-10-01T10:00:00Z"))).toBe("draft-2026-10-01.md");
    expect(markdownFilename(undefined, new Date("2026-10-01T10:00:00Z"))).toBe("draft-2026-10-01.md");
  });
});

describe("wordCount", () => {
  it("counts words", () => {
    expect(wordCount("  one two\nthree ")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});
