import { describe, expect, it } from "vitest";
import {
  buildAnglesPrompt,
  buildBriefPrompt,
  checkSource,
  readiness,
  readinessLabel,
  titleFromCapture,
  usableAngles,
  anglesSchema,
} from "../../convex/lib/research";

describe("readiness", () => {
  it("is READY with two sources", () => {
    expect(readiness({ sourceCount: 2, hasNotes: false, hasBrief: false })).toEqual({ ready: true, needsMore: 0 });
  });
  it("is READY with a note and a brief even with no sources", () => {
    expect(readiness({ sourceCount: 0, hasNotes: true, hasBrief: true }).ready).toBe(true);
  });
  it("says how many sources are missing", () => {
    const none = readiness({ sourceCount: 0, hasNotes: false, hasBrief: false });
    const one = readiness({ sourceCount: 1, hasNotes: true, hasBrief: false });
    expect(readinessLabel(none)).toBe("NEEDS 2 MORE");
    expect(readinessLabel(one)).toBe("NEEDS 1 MORE");
    expect(readinessLabel({ ready: true, needsMore: 0 })).toBe("READY");
  });
});

describe("checkSource", () => {
  it("accepts an https link and labels it with the host", () => {
    const r = checkSource({ kind: "link", url: " https://www.developers.facebook.com/docs/threads " });
    expect(r).toMatchObject({ ok: true, kind: "link", label: "developers.facebook.com" });
  });
  it("refuses a link that is not http(s) or not a URL", () => {
    expect(checkSource({ kind: "link", url: "javascript:alert(1)" })).toMatchObject({ ok: false, code: "BAD_URL" });
    expect(checkSource({ kind: "link", url: "ftp://x.test/a" })).toMatchObject({ ok: false, code: "BAD_URL" });
    expect(checkSource({ kind: "link", url: "not a url" })).toMatchObject({ ok: false, code: "BAD_URL" });
    expect(checkSource({ kind: "link" })).toMatchObject({ ok: false, code: "URL_REQUIRED" });
  });
  it("requires text for quotes and notes and a file for screenshots", () => {
    expect(checkSource({ kind: "quote", text: "  " })).toMatchObject({ ok: false, code: "TEXT_REQUIRED" });
    expect(checkSource({ kind: "note", text: "A thought" })).toMatchObject({ ok: true, label: "Your note" });
    expect(checkSource({ kind: "screenshot" })).toMatchObject({ ok: false, code: "MEDIA_REQUIRED" });
    expect(checkSource({ kind: "screenshot", mediaAssetId: "abc" })).toMatchObject({ ok: true, label: "Screenshot" });
  });
  it("caps text length", () => {
    expect(checkSource({ kind: "note", text: "x".repeat(2001) })).toMatchObject({ ok: false, code: "TOO_LONG" });
  });
});

describe("titleFromCapture", () => {
  it("uses the first non-empty line of text", () => {
    expect(titleFromCapture({ text: "\n\n  Per-post fees tax consistency\nmore" })).toBe("Per-post fees tax consistency");
  });
  it("falls back to the link host and path, then a placeholder", () => {
    expect(titleFromCapture({ url: "https://www.example.com/blog/post/" })).toBe("example.com/blog/post");
    expect(titleFromCapture({})).toBe("Untitled topic");
  });
  it("trims long titles to 80 characters", () => {
    expect(titleFromCapture({ text: "a".repeat(200) })).toHaveLength(80);
  });
});

describe("prompts and parsers", () => {
  it("includes the topic, notes and numbered sources in the brief prompt, and forbids invention", () => {
    const p = buildBriefPrompt({
      title: "Threads rate limits",
      notes: "Explain plainly",
      sources: [
        { kind: "link", label: "developers.facebook.com", url: "https://developers.facebook.com/x" },
        { kind: "quote", label: "Quote", text: "250 posts per 24 hours" },
      ],
    });
    expect(p).toContain("Topic: Threads rate limits");
    expect(p).toContain("1. [link] developers.facebook.com (https://developers.facebook.com/x)");
    expect(p).toContain("2. [quote] Quote: 250 posts per 24 hours");
    expect(p).toMatch(/do not invent facts/i);
  });

  it("requires exactly three angles", () => {
    const one = { platform: "threads", format: "thread", frameKey: "confession", title: "x" };
    expect(anglesSchema.safeParse({ angles: [one, one, one] }).success).toBe(true);
    expect(anglesSchema.safeParse({ angles: [one] }).success).toBe(false);
  });

  it("keeps only angles whose frame exists and fits the format", () => {
    const frames = [
      { key: "confession", fits: ["thread", "reel"] },
      { key: "receipt", fits: ["single", "carousel"] },
    ];
    const angles = [
      { platform: "threads" as const, format: "thread" as const, frameKey: "confession", title: "a" },
      { platform: "instagram" as const, format: "carousel" as const, frameKey: "confession", title: "b" },
      { platform: "instagram" as const, format: "caption" as const, frameKey: "receipt", title: "c" },
      { platform: "threads" as const, format: "thread" as const, frameKey: "ghost", title: "d" },
    ];
    expect(usableAngles(angles, frames).map((a) => a.title)).toEqual(["a", "c"]);
    expect(buildAnglesPrompt({ title: "T", frames: [{ key: "confession", name: "Confession", fits: ["thread"] }] })).toContain(
      "- confession (Confession), fits: thread"
    );
  });
});
