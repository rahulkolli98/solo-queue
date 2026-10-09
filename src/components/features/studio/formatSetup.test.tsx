import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import FormatSetup from "@/components/features/studio/FormatSetup";
import { buildSetupRows, type SetupFrame } from "@/lib/studioSetup";

const beats = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `B${i + 1}` }));
const frames: SetupFrame[] = [
  { key: "confession", name: "Confession", fits: ["thread", "reel"], beats: beats(4) },
  { key: "hot-take", name: "Hot take", fits: ["thread"], beats: beats(3) },
  { key: "ig-caption", name: "Caption: hook, value, ask", fits: ["single"], beats: beats(3) },
  { key: "ig-carousel", name: "Carousel: cover, story, close", fits: ["carousel"], beats: beats(4) },
];
const rows = (choices = {}) =>
  buildSetupRows({ choices, defaults: undefined, legacyDefaultKey: "confession", legacyPostCount: undefined, frames });
const noop = vi.fn();
const render = (over: Partial<Parameters<typeof FormatSetup>[0]> = {}) =>
  renderToStaticMarkup(
    <FormatSetup rows={rows()} open={false} onToggle={noop} disabled={false} onInclude={noop} onFrame={noop} onCount={noop} onBrief={noop} onLook={noop} onMakeDefault={noop} {...over} />
  );
const disabledDefaults = (out: string) => (out.match(/<button[^>]*studio-setup-default[^>]*disabled/g) ?? []).length;

describe("FormatSetup", () => {
  it("closed: one summary line and a Change button, nothing else to fill in", () => {
    const out = render();
    expect(out).toContain("Threads · Confession · 4 posts");
    expect(out).toContain("Caption · Caption: hook, value, ask");
    expect(out).toContain(">Change<");
    expect(out).toContain('aria-expanded="false"');
    expect(out).not.toContain("<select");
    expect(out).not.toContain("checkbox");
  });

  it("open: a row per format with a tick, a frame list that fits it, and Posts for threads only", () => {
    const out = render({ open: true });
    expect(out).toContain('aria-expanded="true"');
    expect(out.match(/type="checkbox"/g)).toHaveLength(5);
    expect(out).toContain('aria-label="Threads story frame"');
    expect(out).toContain('aria-label="Caption story frame"');
    expect(out).toContain("Confession (default)");
    // The caption list holds only caption frames.
    const caption = out.slice(out.indexOf('aria-label="Caption story frame"'), out.indexOf('aria-label="Reel script story frame"'));
    expect(caption).toContain("Caption: hook, value, ask");
    expect(caption).not.toContain("Hot take");
    expect(out.match(/>Posts</g)).toHaveLength(1);
    expect(out.match(/>Slides</g)).toHaveLength(1);
    expect(out).toContain('aria-label="Carousel story frame"');
    expect(out).toContain('<option value="12">12</option>');
    expect(out).toContain('<option value="10">10</option>');
    expect(out.slice(out.indexOf('aria-label="Carousel story frame"'))).toContain('<option value="1">1</option>');
    expect(out).toContain("No story frame");
    expect(out).toContain("A story frame is the shape of the post");
    expect(out).not.toContain("arrives in a later update");
  });

  it("the carousel row has a free-text description and a no-frame choice; no other row does", () => {
    const out = render({ open: true });
    expect(out.match(/<textarea/g)).toHaveLength(1);
    const carousel = out.slice(out.indexOf('data-kind="carousel"'), out.indexOf('data-kind="blog"'));
    expect(carousel).toContain("<textarea");
    expect(carousel).toContain("HOW YOU WANT IT");
    expect(carousel).toContain("No frame: I will describe it");
    expect(carousel).toContain('maxLength="800"');
    const none = render({ open: true, rows: rows({ carousel: { include: true, noFrame: true, brief: "Calm." } }) });
    expect(none).toContain("Calm.</textarea>");
    expect(none).toMatch(/<option value="__none__" selected/);
    const off = render({ open: true });
    expect(off).toMatch(/<textarea[^>]*disabled/);
  });

  it("the carousel row has a look select with the saved looks; no other row does", () => {
    const looks = [{ key: "pastel", name: "Pastel" }, { key: "calm", name: "Calm doc" }];
    const withLooks = (choices = {}) =>
      buildSetupRows({ choices, defaults: undefined, legacyDefaultKey: "confession", legacyPostCount: undefined, frames, looks });
    const out = render({ open: true, rows: withLooks({ carousel: { include: true, lookKey: "calm" } }) });
    expect(out.match(/aria-label="Carousel look"/g)).toHaveLength(1);
    const select = out.slice(out.indexOf('aria-label="Carousel look"'), out.indexOf("</select>", out.indexOf('aria-label="Carousel look"')));
    expect(select).toContain('<option value="">No look</option>');
    expect(select).toContain(">Pastel<");
    expect(select).toMatch(/<option value="calm" selected/);
    expect(out).toContain("A saved design for the carousel");
    // With no looks yet it says how to make one.
    const none = render({ open: true });
    expect(none).toContain("Make one in Library");
    expect(none).toMatch(/aria-label="Carousel look"[^>]*disabled/);
  });

  it("Make default is disabled until a row differs from the saved default", () => {
    expect(disabledDefaults(render({ open: true }))).toBe(5);
    expect(disabledDefaults(render({ open: true, rows: rows({ caption: { include: false } }) }))).toBe(4);
  });

  it("a row that is not ticked cannot pick a frame, and everything is locked while writing", () => {
    const off = render({ open: true, rows: rows({ caption: { include: false } }) });
    expect(off).toMatch(/aria-label="Caption story frame"[^>]*disabled/);
    const busy = render({ open: true, disabled: true });
    expect((busy.match(/<input[^>]*checkbox[^>]*disabled/g) ?? []).length).toBe(5);
  });

  it("with nothing ticked the line says so", () => {
    const none = rows({ threads: { include: false }, caption: { include: false }, reel: { include: false } });
    expect(render({ rows: none })).toContain("Nothing is ticked to write.");
  });
});
