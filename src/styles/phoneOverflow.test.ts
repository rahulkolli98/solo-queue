import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * I-035: a long link in a research brief ("developers.facebook.com/docs/...") has no spaces to
 * wrap at, so it pushed the whole page wider than a phone and clipped the tab bar. Text the
 * founder or a source supplies must be allowed to break anywhere.
 */
const css = (file: string) => readFileSync(resolve(import.meta.dirname, file), "utf8");

function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`${escaped}\\s*(?:,[^{]*)?\\{([^}]*)\\}`).exec(source);
  return match ? match[1] : "";
}

describe("user-supplied text wraps instead of widening the page", () => {
  const research = css("research.css");

  it("the research brief text breaks long links", () => {
    expect(ruleBody(research, ".rs-brief-text p")).toMatch(/overflow-wrap:\s*(anywhere|break-word)/);
  });

  it("the 'sent to Studio' note breaks long links", () => {
    expect(ruleBody(research, ".rs-sendnote")).toMatch(/overflow-wrap:\s*(anywhere|break-word)/);
  });
});
