import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readColorTokens } from "@/lib/contrast";

/**
 * CSS contract for every editable control (textarea, input, select).
 *
 * The bug this guards: `.studio-textarea:hover` set `background: color-mix(...)`,
 * which REPLACED the paper colour of the "Write it myself" box with a see-through
 * tint, so its dark text sat on the dark Threads column and vanished. A state
 * rule on a control may tint with `background-image` (a layer on top of the
 * colour) but must never swap the background colour, and the text colour must be
 * set at rest wherever the background is.
 */
const dir = resolve(__dirname);
const files = readdirSync(dir).filter((f) => f.endsWith(".css"));

interface Rule {
  file: string;
  selector: string;
  decls: Map<string, string>;
}

function parse(file: string): Rule[] {
  const css = readFileSync(resolve(dir, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    if (selector.startsWith("@")) continue;
    const decls = new Map<string, string>();
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i > 0) decls.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
    }
    rules.push({ file, selector, decls });
  }
  return rules;
}

const rules = files.flatMap(parse);

/** Selector parts that are, or are classes of, editable controls. */
const CONTROL = /(^|[\s>+~,])(textarea|input|select)\b|\.sq-input|\.studio-textarea|\.studio-select|\.studio-manual-field|\.rs-capture-input|\.rs-brief-edit|\.lb-trim|\.sq-field/;
const STATE = /:(hover|focus|focus-visible|focus-within|active|disabled|read-only)\b/;

function controlSelectors(rule: Rule): string[] {
  return rule.selector.split(",").map((s) => s.trim()).filter((s) => CONTROL.test(s));
}

describe("editable controls keep readable text in every state", () => {
  it("finds the stylesheets and the control rules (so the checks below are not vacuous)", () => {
    expect(files).toContain("studio.css");
    expect(rules.filter((r) => controlSelectors(r).length > 0).length).toBeGreaterThan(8);
  });

  it("no hover/focus/active/disabled rule on a control swaps the background colour or the text colour", () => {
    const offenders: string[] = [];
    for (const rule of rules) {
      for (const sel of controlSelectors(rule).filter((s) => STATE.test(s))) {
        for (const prop of ["background", "background-color", "color", "-webkit-text-fill-color"]) {
          const value = rule.decls.get(prop);
          if (value === undefined) continue;
          // A disabled control may mute its text (checked for contrast below).
          if (prop === "color" && /:disabled/.test(sel)) continue;
          if (prop === "background" && /:disabled/.test(sel)) continue;
          offenders.push(`${rule.file}: ${sel} { ${prop}: ${value} }`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("a state rule only tints with a background-image layer, never with `transparent` text", () => {
    for (const rule of rules) {
      for (const sel of controlSelectors(rule).filter((s) => STATE.test(s))) {
        expect(rule.decls.get("color"), `${rule.file}: ${sel}`).not.toBe("transparent");
      }
    }
  });

  it("a control class that sets a background at rest also sets its text colour", () => {
    const offenders: string[] = [];
    for (const rule of rules) {
      for (const sel of controlSelectors(rule).filter((s) => !STATE.test(s) && !/::/.test(s))) {
        const hasBg = rule.decls.has("background") || rule.decls.has("background-color");
        const bg = rule.decls.get("background") ?? rule.decls.get("background-color");
        if (hasBg && bg !== "transparent" && !rule.decls.has("color")) {
          offenders.push(`${rule.file}: ${sel}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the manual draft box and caption/reel boxes keep ink on paper (AA)", () => {
    const tokens = readColorTokens(readFileSync(resolve(dir, "tokens.css"), "utf8"));
    expect(contrastRatio(tokens["on-surface"], tokens["surface"])).toBeGreaterThanOrEqual(4.5);
    // disabled text on its paper
    expect(contrastRatio(tokens["muted-on-surface"], tokens["surface"])).toBeGreaterThanOrEqual(4.5);
    // the dark library editor
    expect(contrastRatio(tokens["on-chrome-strong"], tokens["chrome-hover"])).toBeGreaterThanOrEqual(4.5);
  });

  it("the Studio text area hover rule exists and layers a gradient instead of replacing the colour", () => {
    const hover = rules.find((r) => r.file === "studio.css" && /\.studio-textarea:hover/.test(r.selector));
    expect(hover).toBeDefined();
    expect(hover?.decls.has("background-image")).toBe(true);
    expect(hover?.decls.has("background")).toBe(false);
  });
});
