import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Settings parity fixes (TASK-086).
 *
 * 1. A failed connection puts a long provider URL in `.sq-error-box`, which has
 *    no spaces to wrap at, so the page scrolled sideways at 390px. Text from
 *    Meta or the founder inside a connection card must break anywhere.
 * 2. `.sq-card` (globals.css) loads after settings.css, so a settings rule that
 *    only says `.st-voice-card { background }` loses and the card renders plain
 *    cream. Every settings card colour must be doubled up with `.sq-card.`.
 */
const css = readFileSync(resolve(import.meta.dirname, "settings.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The declarations of the first rule whose selector list STARTS with `selector`. */
function ruleBody(source: string, selector: string): string {
  const match = new RegExp(`(?:^|[}\\s])${escapeRe(selector)}\\s*(?:,[^{]*)?\\{([^}]*)\\}`).exec(source);
  return match ? match[1] : "";
}

const WRAPS = /overflow-wrap:\s*(anywhere|break-word)/;

describe("connection cards wrap provider text instead of widening the page", () => {
  it("the error box breaks long URLs", () => {
    expect(ruleBody(css, ".sq-conn-card .sq-error-box")).toMatch(WRAPS);
  });

  it("the handle, hint text and scope chips break too", () => {
    expect(ruleBody(css, ".sq-conn-card .sq-muted")).toMatch(WRAPS);
    expect(css).toMatch(/\.sq-conn-card \.sq-muted,\s*\.sq-conn-card \.sq-kv-mono,\s*\.sq-conn-card \.sq-chip/);
  });

  it("banners on a settings screen (sign-in detail, test results) break long text", () => {
    expect(ruleBody(css, ".st-section .sq-banner")).toMatch(WRAPS);
  });
});

describe("settings card colours beat .sq-card", () => {
  const cases: Array<[string, RegExp]> = [
    [".sq-card.st-voice-card", /background:\s*var\(--color-threads\)/],
    [".sq-card.st-pillar", /background:\s*var\(--st-pillar\)/],
    [".sq-card.st-notes", /background:\s*var\(--color-info\)/],
    [".sq-card.st-export", /background:\s*var\(--color-threads\)/],
    [".sq-card.st-platform[data-platform=\"threads\"]", /background:\s*var\(--color-threads\)/],
    [".sq-card.st-platform[data-platform=\"instagram\"]", /background:\s*var\(--color-instagram\)/],
    [".sq-card.st-danger", /border:\s*1\.5px solid var\(--color-error\)/],
    [".sq-card.st-rows", /padding:/],
  ];
  for (const [selector, expected] of cases) {
    it(`${selector} is specific enough`, () => {
      expect(ruleBody(css, selector)).toMatch(expected);
    });
  }

  it("no bare settings rule sets a card background, border or padding that .sq-card would override", () => {
    for (const sel of [".st-voice-card", ".st-pillar", ".st-notes", ".st-export", ".st-danger", ".st-rows", ".st-platform"]) {
      const body = new RegExp(`(?:^|[}\\s,])${escapeRe(sel)}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      expect(body, `${sel} must be written as .sq-card${sel}`).not.toMatch(/(^|[;\s])(background|border|border-color|padding)\s*:/);
    }
  });
});

describe("the phone settings list", () => {
  it("hides the desktop hero and the flat list below 768px", () => {
    const phone = css.slice(css.indexOf("@media (max-width: 767px)"));
    expect(phone).toMatch(/\.st-head,\s*\.st-nav-flat\s*\{\s*display:\s*none/);
  });

  it("makes each group one card with 56px rows", () => {
    expect(css).toMatch(/\.st-group-card \.st-link\s*\{[^}]*height:\s*56px/);
  });
});
