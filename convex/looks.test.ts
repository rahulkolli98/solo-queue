import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_SETTINGS } from "./lib/settingsModel";
import { DESIGN_MAX, planForCount, planFromSlides, slugKey, uniqueKey, validateLook, type PlanSlide } from "./lib/looks";
import { insertDraft, insertSlot, insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

const plan4: PlanSlide[] = [
  { layout: "cover", tone: "pink" },
  { layout: "cards", tone: "yellow" },
  { layout: "list", tone: "blue" },
  { layout: "close", tone: "ink" },
];

describe("validateLook", () => {
  it("needs a name and at least one of a plan, a design document or reference images", () => {
    expect(validateLook({ name: "  ", plan: plan4 })).toMatchObject({ ok: false, message: "Give the look a name." });
    expect(validateLook({ name: "Calm" })).toMatchObject({ ok: false });
    expect(validateLook({ name: "Calm", design: "   ", plan: [], referenceIds: [] })).toMatchObject({ ok: false });
    expect(validateLook({ name: "Calm", plan: plan4 }).ok).toBe(true);
    expect(validateLook({ name: "Calm", design: "# Calm\nLots of white space." }).ok).toBe(true);
    expect(validateLook({ name: "Calm", referenceIds: ["a"] }).ok).toBe(true);
  });

  it("trims the name and the document, and keeps each part within its limits", () => {
    const ok = validateLook({ name: "  Calm   explainer ", design: "  Quiet.\r\nPlain.  " });
    expect(ok.ok && ok.look).toMatchObject({ name: "Calm explainer", design: "Quiet.\nPlain." });
    expect(validateLook({ name: "x".repeat(61), plan: plan4 }).ok).toBe(false);
    expect(validateLook({ name: "A", design: "x".repeat(DESIGN_MAX) }).ok).toBe(true);
    expect(validateLook({ name: "A", design: "x".repeat(DESIGN_MAX + 1) })).toMatchObject({ ok: false });
    expect(validateLook({ name: "A", plan: plan4.slice(0, 1) })).toMatchObject({ ok: false });
    expect(validateLook({ name: "A", plan: Array.from({ length: 11 }, () => plan4[1]) })).toMatchObject({ ok: false });
    expect(validateLook({ name: "A", plan: [{ layout: "cards", tone: "purple" } as never, plan4[1]] })).toMatchObject({ ok: false });
    expect(validateLook({ name: "A", referenceIds: Array.from({ length: 7 }, (_, i) => `r${i}`) })).toMatchObject({ ok: false });
    expect(validateLook({ name: "A", referenceIds: ["r1", "r1"] })).toMatchObject({ ok: false });
  });
});

describe("keys", () => {
  it("makes a readable key from the name and keeps it free", () => {
    expect(slugKey("Calm Explainer!")).toBe("calm-explainer");
    expect(slugKey("  Café — noir ")).toBe("cafe-noir");
    expect(slugKey("***")).toBe("look");
    expect(uniqueKey("Calm", new Set())).toBe("calm");
    expect(uniqueKey("Calm", new Set(["calm", "calm-2"]))).toBe("calm-3");
  });
});

describe("planFromSlides and planForCount", () => {
  it("a plan is each slide's layout and colour, with a cover first and a close last", () => {
    const slides = [
      { layout: "cover" as const, tone: "cream" as const },
      { layout: "cards" as const, tone: "ink" as const },
      { layout: "list" as const, tone: "blue" as const },
      { layout: "cards" as const, tone: "yellow" as const },
    ];
    expect(planFromSlides(slides)).toEqual([
      { layout: "cover", tone: "cream" },
      { layout: "cards", tone: "ink" },
      { layout: "list", tone: "blue" },
      { layout: "close", tone: "yellow" },
    ]);
    expect(planFromSlides(slides.slice(0, 1))).toBeNull();
    expect(planFromSlides([{ layout: "statement", tone: "ink" }])).toBeNull();
  });

  it("is stretched to any slide count: the cover and the close stay, the middle slides cycle", () => {
    expect(planForCount(plan4, 4)).toEqual(plan4);
    expect(planForCount(plan4, 2)).toEqual([plan4[0], plan4[3]]);
    expect(planForCount(plan4, 6)?.map((p) => `${p.layout}/${p.tone}`)).toEqual([
      "cover/pink",
      "cards/yellow",
      "list/blue",
      "cards/yellow",
      "list/blue",
      "close/ink",
    ]);
    expect(planForCount(plan4, 3)?.map((p) => p.layout)).toEqual(["cover", "cards", "close"]);
    // One slide is a statement image: no plan.
    expect(planForCount(plan4, 1)).toBeNull();
    // A plan of just a cover and a close fills the middle with cards in rotating colours.
    const filled = planForCount([plan4[0], plan4[3]], 5) ?? [];
    expect(filled.map((p) => p.layout)).toEqual(["cover", "cards", "cards", "cards", "close"]);
    expect(new Set(filled.slice(1, 4).map((p) => p.tone)).size).toBe(3);
  });
});

async function assets(t: TestConvex, n: number, mimeType = "image/png"): Promise<Id<"mediaAssets">[]> {
  return await t.run(async (ctx) => {
    const ids: Id<"mediaAssets">[] = [];
    for (let i = 0; i < n; i += 1) {
      ids.push(await ctx.db.insert("mediaAssets", { storageId: `external:ref${i}`, publicUrl: `https://files.example/ref${i}.png`, mimeType, source: "upload", createdAt: Date.now() }));
    }
    return ids;
  });
}

describe("looks.save, list and remove", () => {
  it("creates a look with a key from its name, lists them oldest first, and numbers a repeated name", async () => {
    const t = newTest();
    const a = await t.mutation(api.looks.save, { name: "Calm explainer", plan: plan4 });
    const b = await t.mutation(api.looks.save, { name: "Calm explainer", design: "# Calm\nWhite space." });
    expect(a).toEqual({ key: "calm-explainer", created: true });
    expect(b).toEqual({ key: "calm-explainer-2", created: true });
    const list = await t.query(api.looks.list, {});
    expect(list.map((l) => l.key)).toEqual(["calm-explainer", "calm-explainer-2"]);
    expect(list[0]).toMatchObject({ name: "Calm explainer", plan: plan4, usedCount: 0 });
    expect(list[0].design).toBeUndefined();
  });

  it("edits a look by its key, keeping its use count and its key, and clears a part that is left out", async () => {
    const t = newTest();
    const { key } = await t.mutation(api.looks.save, { name: "Calm", plan: plan4, design: "Quiet." });
    await t.mutation(internal.looks.recordUse, { key });
    const out = await t.mutation(api.looks.save, { key, name: "Calmer", design: "Quieter." });
    expect(out).toEqual({ key, created: false });
    const [row] = await t.query(api.looks.list, {});
    expect(row).toMatchObject({ key, name: "Calmer", design: "Quieter.", usedCount: 1 });
    expect(row.plan).toBeUndefined();
    await expect(t.mutation(api.looks.save, { key: "nope", name: "X", design: "y" })).rejects.toThrow(/LOOK_NOT_FOUND/);
  });

  it("refuses an invalid look and a reference image that is missing, removed or not an image the model reads", async () => {
    const t = newTest();
    await expect(t.mutation(api.looks.save, { name: "Empty" })).rejects.toThrow(/INVALID_LOOK/);
    await expect(t.mutation(api.looks.save, { name: "", plan: plan4 })).rejects.toThrow(/INVALID_LOOK: Give the look a name/);
    const [png] = await assets(t, 1);
    const [gif] = await assets(t, 1, "image/gif");
    await expect(t.mutation(api.looks.save, { name: "G", referenceIds: [gif] })).rejects.toThrow(/REFERENCE_TYPE/);
    await t.run(async (ctx) => ctx.db.patch(png, { fileDeletedAt: Date.now() }));
    await expect(t.mutation(api.looks.save, { name: "R", referenceIds: [png] })).rejects.toThrow(/MEDIA_REMOVED/);
    const [ok] = await assets(t, 1);
    await t.run(async (ctx) => ctx.db.delete(ok));
    await expect(t.mutation(api.looks.save, { name: "M", referenceIds: [ok] })).rejects.toThrow(/MEDIA_MISSING/);
    expect(await t.query(api.looks.list, {})).toHaveLength(0);
  });

  it("deletes a look and leaves its reference images in the library", async () => {
    const t = newTest();
    const [img] = await assets(t, 1);
    const { key } = await t.mutation(api.looks.save, { name: "Refs", referenceIds: [img] });
    await t.mutation(api.looks.remove, { key });
    expect(await t.query(api.looks.list, {})).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.get(img))).not.toBeNull();
    await expect(t.mutation(api.looks.remove, { key })).rejects.toThrow(/LOOK_NOT_FOUND/);
  });
});

describe("a reference image is protected while a look uses it", () => {
  it("cannot be deleted from the library, and the library says it is in use", async () => {
    const t = newTest();
    const [img, other] = await assets(t, 2);
    const { key } = await t.mutation(api.looks.save, { name: "Refs", referenceIds: [img] });
    await expect(t.mutation(api.media.remove, { id: img })).rejects.toThrow(/IN_USE: 1 look uses this file as a reference/);
    const listed = await t.query(api.media.list, {});
    expect(listed.find((a) => a._id === img)?.usedBy).toBe(1);
    expect(listed.find((a) => a._id === other)?.usedBy).toBe(0);
    await t.mutation(api.looks.remove, { key });
    await t.mutation(api.media.remove, { id: img });
  });

  it("is kept by the cleanup after publishing, even when its post was published long ago", async () => {
    const DAY = 86_400_000;
    const NOW = Date.UTC(2026, 9, 5, 12, 0);
    const t = newTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("appSettings", { ...DEFAULT_SETTINGS, media: { igCrop: "4:5", cleanupAfterDays: 7 } });
    });
    const topic = await insertTopic(t);
    const [kept, gone] = await t.run(async (ctx) => {
      const ids: Id<"mediaAssets">[] = [];
      for (let i = 0; i < 2; i += 1) {
        const storageId = await ctx.storage.store(new Blob(["pixels"], { type: "image/png" }));
        ids.push(await ctx.db.insert("mediaAssets", { storageId, publicUrl: "https://files.example/" + i, mimeType: "image/png", source: "upload", verifiedAt: NOW, createdAt: NOW - 30 * DAY }));
      }
      return ids;
    });
    for (const id of [kept, gone]) {
      const draft = await insertDraft(t, topic, "instagram", "A caption", "ig-caption-beats");
      await t.run(async (ctx) => ctx.db.patch(draft, { mediaAssetId: id }));
      const slot = await insertSlot(t, draft, NOW - 10 * DAY, { platform: "instagram", status: "published" });
      await t.run(async (ctx) => ctx.db.patch(slot, { publishedAt: NOW - 10 * DAY }));
    }
    await t.mutation(api.looks.save, { name: "Refs", referenceIds: [kept] });
    const out = await t.mutation(internal.media.cleanupPublished, { now: NOW });
    expect(out).toEqual({ status: "done", deleted: 1 });
    expect((await t.run((ctx) => ctx.db.get(kept)))?.fileDeletedAt).toBeUndefined();
    expect((await t.run((ctx) => ctx.db.get(gone)))?.fileDeletedAt).toBeDefined();
  });
});
