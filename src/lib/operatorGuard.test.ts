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
/** Files that are not function modules. */
const NOT_FUNCTION_MODULES = new Set(["auth.config.ts", "schema.ts"]);
/** Raw registration builders: public the moment they are used. */
const RAW_BUILDERS = new Set(["query", "mutation", "action", "queryGeneric", "mutationGeneric", "actionGeneric", "httpAction"]);
const RAW_CALL = /=\s*(query|mutation|action|queryGeneric|mutationGeneric|actionGeneric)\s*\(/;
const DEFAULT_EXPORT = /\bexport\s+default\s+(query|mutation|action|httpAction)\b/;
const HTTP_ENDPOINT = /\bhttpAction\b|\bhttpRouter\b/;
const SERVER_IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"((?:\.\.?\/)+_generated\/server|convex\/server)"/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "_generated") return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const base = (f: string) => f.split(/[\\/]/).pop() as string;
const files = sourceFiles(CONVEX_DIR).filter((f) => !NOT_FUNCTION_MODULES.has(base(f)));
const isWrapperFile = (f: string) => f.endsWith(join("lib", "operator.ts"));

/** Raw builders a file imports, including aliased ones (`query as q`). */
function importedRawBuilders(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(SERVER_IMPORT)) {
    for (const spec of m[1].split(",")) {
      const name = spec.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, "");
      if (RAW_BUILDERS.has(name)) found.push(name);
    }
  }
  return found;
}

describe("operator guard coverage", () => {
  it("finds the Convex source files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("uses no raw builder, HTTP endpoint or default-exported builder outside the waitlist and the wrappers", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (PUBLIC_ALLOWLIST.has(base(file)) || isWrapperFile(file)) continue;
      const text = readFileSync(file, "utf8");
      if (RAW_CALL.test(text)) offenders.push(`${file}: raw builder call`);
      if (DEFAULT_EXPORT.test(text)) offenders.push(`${file}: default-exported raw builder`);
      if (HTTP_ENDPOINT.test(text)) offenders.push(`${file}: HTTP endpoint (not covered by the wrappers)`);
      for (const name of importedRawBuilders(text)) offenders.push(`${file}: imports raw ${name}`);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the waitlist as the only public module", () => {
    const publicModules = files.filter((f) => RAW_CALL.test(readFileSync(f, "utf8"))).map(base);
    expect(publicModules).toEqual(["waitlist.ts"]);
  });

  it("does not export a raw builder from a lib file", () => {
    const lib = files.filter((f) => f.includes(join("convex", "lib")) && !isWrapperFile(f));
    for (const file of lib) {
      expect(readFileSync(file, "utf8")).not.toMatch(/export const \w+\s*=\s*(query|mutation|action)\s*\(/);
    }
  });

  it("the detector itself catches the slips it is meant to catch", () => {
    expect(RAW_CALL.test("export const x = query({")).toBe(true);
    expect(RAW_CALL.test("export const x = actionGeneric(")).toBe(true);
    expect(RAW_CALL.test("export const x = operatorQuery({")).toBe(false);
    expect(DEFAULT_EXPORT.test("export default query(")).toBe(true);
    expect(HTTP_ENDPOINT.test('import { httpRouter } from "convex/server";')).toBe(true);
    expect(importedRawBuilders('import { query as q, internalQuery } from "./_generated/server";')).toEqual(["query"]);
    expect(importedRawBuilders('import { mutationGeneric } from "convex/server";')).toEqual(["mutationGeneric"]);
    expect(importedRawBuilders('import { internalMutation, type MutationCtx } from "./_generated/server";')).toEqual([]);
  });
});
