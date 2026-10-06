import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * design.md: colours come from tokens, never invented values. Every stylesheet
 * except tokens.css (where the palette is defined) must use var(--color-*) or
 * color-mix of a token, never a raw hex, rgb(), rgba(), hsl() or hsla().
 */
const dir = import.meta.dirname;
const files = [
  ...readdirSync(dir)
    .filter((f) => f.endsWith(".css") && f !== "tokens.css")
    .map((f) => resolve(dir, f)),
  resolve(dir, "../app/globals.css"),
];

const RAW = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;

describe("stylesheets use colour tokens only", () => {
  it("has stylesheets to check", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  for (const file of files) {
    it(`${file.split(/[\/]/).slice(-2).join("/")} has no raw colour values`, () => {
      const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      const hits = css.split("\n").filter((line) => RAW.test(line));
      expect(hits).toEqual([]);
    });
  }
});
