import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A stylesheet with one `}` missing still passes every other test and then fails `next build` with a
 * "Missing closing }" error (a merge of two files that both added a rule can do it). Count the braces here so the
 * test run says so first.
 */
const dir = import.meta.dirname;
const files = [
  ...readdirSync(dir).filter((f) => f.endsWith(".css")).map((f) => resolve(dir, f)),
  resolve(dir, "../app/globals.css"),
];

describe("stylesheets have balanced braces", () => {
  for (const file of files) {
    it(file.split(/[\/]/).slice(-2).join("/"), () => {
      const css = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      let depth = 0;
      for (const ch of css) {
        if (ch === "{") depth += 1;
        if (ch === "}") depth -= 1;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
      expect(depth).toBe(0);
    });
  }
});
