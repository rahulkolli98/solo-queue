import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import { DEFAULT_FRAMES, frameToPrompt, validateFrame } from "./lib/framesModel";
import { newTest } from "../src/test-utils/convex";

const confession = DEFAULT_FRAMES[0];

describe("framesModel", () => {
  it("ships eight valid default frames with 2 to 5 beats each", () => {
    expect(DEFAULT_FRAMES).toHaveLength(8);
    for (const f of DEFAULT_FRAMES) {
      expect(validateFrame(f).ok, f.key).toBe(true);
      expect(f.beats.length).toBeGreaterThanOrEqual(2);
      expect(f.beats.length).toBeLessThanOrEqual(5);
    }
    expect(new Set(DEFAULT_FRAMES.map((f) => f.key)).size).toBe(8);
  });

  it("refuses bad keys, too few or too many beats, and empty fits", () => {
    expect(validateFrame({ ...confession, key: "Bad Key" }).ok).toBe(false);
    expect(validateFrame({ ...confession, beats: confession.beats.slice(0, 1) }).ok).toBe(false);
    const six = Array.from({ length: 6 }, (_, i) => ({ label: `B${i}`, hint: "" }));
    expect(validateFrame({ ...confession, beats: six }).ok).toBe(false);
    expect(validateFrame({ ...confession, fits: [] }).ok).toBe(false);
  });

  it("renders numbered beats for the drafting prompt", () => {
    const text = frameToPrompt(confession);
    expect(text).toContain('Story frame "Confession"');
    expect(text).toContain("1. Admit:");
    expect(text).toContain("4. Invite:");
  });
});

describe("frames functions", () => {
  it("ensureDefaults seeds the eight frames once and never overwrites an edit", async () => {
    const t = newTest();
    expect((await t.mutation(api.frames.ensureDefaults, {})).inserted).toBe(8);
    await t.mutation(api.frames.save, { ...confession, name: "My confession" });
    expect((await t.mutation(api.frames.ensureDefaults, {})).inserted).toBe(0);
    const frame = await t.query(api.frames.getByKey, { key: "confession" });
    expect(frame?.name).toBe("My confession");
    expect(frame?.version).toBe(2);
  });

  it("adds only the missing seeded frames to an install that already has the older six", async () => {
    const t = newTest();
    await t.mutation(api.frames.ensureDefaults, {});
    await t.run(async (ctx) => {
      for (const key of ["ig-caption", "ig-reel"]) {
        const row = await ctx.db.query("frames").withIndex("by_key", (q) => q.eq("key", key)).first();
        if (row) await ctx.db.delete(row._id);
      }
    });
    expect((await t.mutation(api.frames.ensureDefaults, {})).inserted).toBe(2);
    expect((await t.query(api.frames.list, {})).map((f) => f.key)).toContain("ig-reel");
  });

  it("save creates a new frame, then bumps version on edit and keeps usedCount", async () => {
    const t = newTest();
    const created = await t.mutation(api.frames.save, { ...confession, key: "mine", name: "Mine" });
    expect(created).toEqual({ key: "mine", version: 1, created: true });
    await t.mutation(internal.frames.recordUse, { key: "mine" });
    await t.mutation(internal.frames.recordUse, { key: "mine" });
    const edited = await t.mutation(api.frames.save, { ...confession, key: "mine", name: "Mine v2" });
    expect(edited.version).toBe(2);
    const row = await t.query(api.frames.getByKey, { key: "mine" });
    expect(row?.usedCount).toBe(2);
  });

  it("rejects an invalid frame with a readable refusal", async () => {
    const t = newTest();
    await expect(
      t.mutation(api.frames.save, { ...confession, beats: [{ label: "Only", hint: "" }] })
    ).rejects.toThrow(/INVALID_FRAME/);
  });

  it("setActive hides a frame from list but keeps it by key", async () => {
    const t = newTest();
    await t.mutation(api.frames.ensureDefaults, {});
    await t.mutation(api.frames.setActive, { key: "teardown", isActive: false });
    const keys = (await t.query(api.frames.list, {})).map((f) => f.key);
    expect(keys).not.toContain("teardown");
    expect(keys).toHaveLength(7);
    expect((await t.query(api.frames.getByKey, { key: "teardown" }))?.isActive).toBe(false);
    await expect(t.mutation(api.frames.setActive, { key: "nope", isActive: true })).rejects.toThrow(
      /FRAME_NOT_FOUND/
    );
  });
});
