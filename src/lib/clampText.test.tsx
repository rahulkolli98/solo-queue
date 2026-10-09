import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ClampedText from "@/components/ui/ClampedText";
import { CLAMP_LIMIT, clampText } from "@/lib/clampText";
import { charLen } from "@/lib/draftText";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("clampText", () => {
  it("leaves short text alone", () => {
    expect(clampText("A short note.")).toEqual({ short: "A short note.", clipped: false });
    const exact = "x".repeat(CLAMP_LIMIT);
    expect(clampText(exact).clipped).toBe(false);
  });

  it("cuts long text at a word boundary, inside the limit", () => {
    const text = words(120);
    const { short, clipped } = clampText(text);
    expect(clipped).toBe(true);
    expect(charLen(short)).toBeLessThanOrEqual(CLAMP_LIMIT);
    expect(charLen(short)).toBeGreaterThan(CLAMP_LIMIT * 0.6);
    // Ends on a whole word, never mid-word.
    expect(text.startsWith(short)).toBe(true);
    expect(text[short.length]).toBe(" ");
    expect(short.endsWith(" ")).toBe(false);
  });

  it("hard-cuts one long unbroken run", () => {
    const { short, clipped } = clampText("a".repeat(900));
    expect(clipped).toBe(true);
    expect(charLen(short)).toBe(CLAMP_LIMIT);
  });

  it("counts an emoji as one character and never splits it", () => {
    const text = "😀".repeat(400);
    const { short, clipped } = clampText(text);
    expect(clipped).toBe(true);
    expect(charLen(short)).toBe(CLAMP_LIMIT);
    expect(short).toBe("😀".repeat(CLAMP_LIMIT));
  });

  it("takes a custom limit", () => {
    expect(clampText("one two three four", 9)).toEqual({ short: "one two", clipped: true });
  });
});

describe("ClampedText", () => {
  it("shows the start of a long text with a Show more toggle that is collapsed", () => {
    const text = words(120);
    const html = renderToStaticMarkup(<ClampedText text={text}>{(shown) => <p>{shown}</p>}</ClampedText>);
    expect(html).toContain("Show more");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("…");
    expect(html).not.toContain("word119");
  });

  it("shows short text whole, with no toggle", () => {
    const html = renderToStaticMarkup(<ClampedText text="Short.">{(shown) => <p>{shown}</p>}</ClampedText>);
    expect(html).toContain("Short.");
    expect(html).not.toContain("Show more");
    expect(html).not.toContain("button");
  });

  it("points the toggle at the text it controls", () => {
    const html = renderToStaticMarkup(<ClampedText text={words(120)}>{(shown) => <p>{shown}</p>}</ClampedText>);
    const controls = /aria-controls="([^"]+)"/.exec(html)?.[1];
    expect(controls).toBeTruthy();
    expect(html).toContain(`id="${controls}"`);
  });
});
