import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every public Convex function must be built with the operator wrappers
 * (convex/lib/operator.ts) so it refuses anonymous callers. The one exception
 * is the landing page's waitlist. This keeps a new function from being added
 * unguarded by mistake.
 */
const CONVEX_DIR = "convex";
const PUBLIC_ALLOWLIST = new Set(["waitlist.ts"]);
/** Files that define the wrappers themselves or are not function modules. */
const NOT_FUNCTION_MODULES = new Set(["auth.config.ts", "schema.ts"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "_generated") return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const files = sourceFiles(CONVEX_DIR).filter((f) => !NOT_FUNCTION_MODULES.has(f.replace(`${CONVEX_DIR}${"\\"}`, "").replace(`${CONVEX_DIR}/`, "")));
const base = (f: string) => f.split(/[\\/]/).pop() as string;

describe("operator guard coverage", () => {
  it("finds the Convex source files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("uses no raw query / mutation / action builder outside the waitlist and the wrappers", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (PUBLIC_ALLOWLIST.has(base(file)) || file.endsWith(join("lib", "operator.ts"))) continue;
      const text = readFileSync(file, "utf8");
      if (/=\s*(query|mutation|action)\s*\(/.test(text)) offenders.push(`${file}: raw builder call`);
      const imp = /import\s*\{([^}]*)\}\s*from\s*"(?:\.\.?\/)+_generated\/server"/g;
      for (const m of text.matchAll(imp)) {
        const names = m[1].split(",").map((n) => n.trim());
        for (const n of names) if (["query", "mutation", "action"].includes(n)) offenders.push(`${file}: imports raw ${n}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the waitlist as the only public module", () => {
    const publicModules = files
      .filter((f) => /=\s*(query|mutation|action)\s*\(/.test(readFileSync(f, "utf8")))
      .map(base);
    expect(publicModules).toEqual(["waitlist.ts"]);
  });

  it("does not make any internal-only function public by exporting a raw builder from a lib file", () => {
    const lib = files.filter((f) => f.includes(`${join("convex", "lib")}`) && !f.endsWith(join("lib", "operator.ts")));
    for (const file of lib) {
      expect(readFileSync(file, "utf8")).not.toMatch(/export const \w+\s*=\s*(query|mutation|action)\s*\(/);
    }
  });
});
