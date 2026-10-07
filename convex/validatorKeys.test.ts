import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Convex only accepts identifiers (letters, digits, underscores) as field names in `v.object({...})`, but the
 * test backend does not check it: a hyphenated key passes every test and then fails `convex dev` / deploy
 * with "Identifier ... has invalid character". This reads the source so it fails here first.
 */
describe("validator field names", () => {
  it("no v.object field in convex/ is a quoted name with a character Convex rejects", () => {
    const bad: string[] = [];
    const files = readdirSync(__dirname).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
    for (const file of files) {
      readFileSync(join(__dirname, file), "utf8")
        .split(/\r?\n/)
        .forEach((line, i) => {
          const m = /^\s*"([^"]+)"\s*:\s*v\./.exec(line);
          if (m && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(m[1])) bad.push(`${file}:${i + 1} "${m[1]}"`);
        });
    }
    expect(bad).toEqual([]);
  });
});
