import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readColorTokens } from "./contrast";

const tokens = readColorTokens(
  readFileSync(resolve(__dirname, "../styles/tokens.css"), "utf8")
);

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for identical colors", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#c8412b", "#c8412b")).toBeCloseTo(1, 5);
  });
});

describe("token pairs the app-wide primitives rely on (WCAG AA, 4.5:1 for text)", () => {
  const pairs: [string, string, string][] = [
    ["body text on the cream panel", "on-surface", "surface"],
    ["body text on raised paper", "on-surface", "surface-raised"],
    ["text on the espresso chrome", "on-chrome-strong", "chrome"],
    ["secondary text on the chrome (toast detail)", "muted-on-chrome", "chrome"],
    ["muted text on the cream panel", "muted-on-surface", "surface"],
    ["coral banner: white on error", "on-primary", "error"],
    ["primary button: white on primary", "on-primary", "primary"],
    ["yellow banner: ink on warning", "on-surface", "warning"],
    ["blue banner: ink on info", "on-surface", "info"],
    ["count badge: ink on threads yellow", "on-surface", "threads"],
    ["error text on its tint", "primary-deep", "error-tint"],
    ["tab label: muted on the chrome", "muted-on-chrome", "chrome"],
    ["pill ok: ink on yellow", "on-surface", "warning"],
    ["pill mid: ink on dim paper", "on-surface", "paper-dim"],
  ];

  it.each(pairs)("%s", (_label, fg, bg) => {
    expect(tokens[fg], `missing token ${fg}`).toBeDefined();
    expect(tokens[bg], `missing token ${bg}`).toBeDefined();
    expect(contrastRatio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("tokens.css", () => {
  it("defines every color token the design system names", () => {
    for (const name of [
      "chrome",
      "surface",
      "surface-raised",
      "line",
      "line-soft",
      "primary",
      "primary-deep",
      "threads",
      "instagram",
      "pillar-build",
      "pillar-tools",
      "pillar-screen",
      "pillar-craft",
      "success",
      "warning",
      "error",
      "info",
      "error-tint",
      "slot-empty",
      "tape-yellow",
      "tape-cream",
      "tape-coral",
      "dot-blue",
    ]) {
      expect(tokens[name], name).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("never introduces green (design.md: status speaks espresso, rust and yellow)", () => {
    for (const [name, hex] of Object.entries(tokens)) {
      const n = parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      expect(g > r + 20 && g > b + 20, `${name} ${hex} reads green`).toBe(false);
    }
  });
});
