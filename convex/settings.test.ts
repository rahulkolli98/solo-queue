import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { DEFAULT_SETTINGS } from "./lib/settingsModel";
import { newTest } from "../src/test-utils/convex";

describe("settings.get / settings.update (appSettings singleton)", () => {
  it("returns the defaults before anything is stored, without writing", async () => {
    const t = newTest();
    expect(await t.query(api.settings.get, {})).toEqual(DEFAULT_SETTINGS);
    const rows = await t.run(async (ctx) => ctx.db.query("appSettings").collect());
    expect(rows).toHaveLength(0);
  });

  it("creates the singleton on the first update and keeps exactly one row", async () => {
    const t = newTest();
    await t.mutation(api.settings.update, { patch: { naturalTiming: false } });
    await t.mutation(api.settings.update, { patch: { timezone: "Asia/Kolkata" } });
    const rows = await t.run(async (ctx) => ctx.db.query("appSettings").collect());
    expect(rows).toHaveLength(1);
    const got = await t.query(api.settings.get, {});
    expect(got.naturalTiming).toBe(false);
    expect(got.timezone).toBe("Asia/Kolkata");
    expect(got.rules).toEqual(DEFAULT_SETTINGS.rules);
  });

  it("refuses invalid sections with a readable ConvexError and stores nothing", async () => {
    const t = newTest();
    await expect(
      t.mutation(api.settings.update, {
        patch: { slotDefaults: { threads: ["99:99"], instagram: [] } },
      })
    ).rejects.toThrow(/INVALID_SETTINGS: slotDefaults/);
    const rows = await t.run(async (ctx) => ctx.db.query("appSettings").collect());
    expect(rows).toHaveLength(0);
  });

  it("does not touch the legacy key/value settings table", async () => {
    const t = newTest();
    await t.mutation(api.settings.update, { patch: { naturalTiming: false } });
    const legacy = await t.run(async (ctx) => ctx.db.query("settings").collect());
    expect(legacy).toHaveLength(0);
  });
});
