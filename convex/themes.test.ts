import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { DEFAULT_THEME, THEMES, isThemeKey, themeName, themeOf, themeShowsNotes } from "./lib/themes";
import { placeholderSlides } from "./lib/ownCarousel";
import { validateLook } from "./lib/looks";
import { LIMITS, validateSlide } from "./lib/carouselSlides";
import { insertSlot, insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

describe("the theme list", () => {
  it("knows its themes, falls back to Solo Queue for anything else, and says which draw notes", () => {
    expect(THEMES.map((t) => t.key)).toEqual(["solo-queue", "kraft-zine"]);
    expect(DEFAULT_THEME).toBe("solo-queue");
    expect(isThemeKey("kraft-zine")).toBe(true);
    expect(isThemeKey("neon")).toBe(false);
    expect(isThemeKey(undefined)).toBe(false);
    expect(themeOf("kraft-zine")).toBe("kraft-zine");
    expect(themeOf("neon")).toBe("solo-queue");
    expect(themeOf(undefined)).toBe("solo-queue");
    expect(themeName("kraft-zine")).toBe("Kraft zine");
    expect(themeName(undefined)).toBe("Solo Queue");
    expect(themeShowsNotes("kraft-zine")).toBe(true);
    expect(themeShowsNotes("solo-queue")).toBe(false);
    expect(themeShowsNotes("neon")).toBe(false);
  });
});

describe("a slide's hand-written note", () => {
  it("is optional, limited to 40 characters, and accepted on any layout", () => {
    const base = { layout: "cards", tone: "ink", headline: "A headline" } as const;
    expect(validateSlide(base).ok).toBe(true);
    expect(validateSlide({ ...base, note: "about 2 hours on one 3090" }).ok).toBe(true);
    expect(validateSlide({ ...base, note: "x".repeat(LIMITS.note) }).ok).toBe(true);
    expect(validateSlide({ ...base, note: "x".repeat(LIMITS.note + 1) }).ok).toBe(false);
  });
});

describe("a look can carry a theme", () => {
  it("counts as one of a look's parts, and an unknown theme is refused", () => {
    expect(validateLook({ name: "Zine", theme: "kraft-zine" }).ok).toBe(true);
    expect(validateLook({ name: "Zine", theme: "neon" })).toMatchObject({ ok: false, message: "That theme is not available. Pick another." });
    expect(validateLook({ name: "Zine" })).toMatchObject({ ok: false });
    // An empty theme means none.
    expect(validateLook({ name: "Zine", theme: "", design: "Quiet." }).ok).toBe(true);
  });

  it("is saved, listed and edited like the other parts", async () => {
    const t = newTest();
    const { key } = await t.mutation(api.looks.save, { name: "Zine", theme: "kraft-zine" });
    expect((await t.query(api.looks.list, {}))[0]).toMatchObject({ key, theme: "kraft-zine" });
    await t.mutation(api.looks.save, { key, name: "Zine", theme: "kraft-zine", design: "Heavy type." });
    expect((await t.query(api.looks.list, {}))[0]).toMatchObject({ theme: "kraft-zine", design: "Heavy type." });
    await t.mutation(api.looks.save, { key, name: "Zine", design: "Heavy type." });
    expect((await t.query(api.looks.list, {}))[0].theme).toBeUndefined();
    await expect(t.mutation(api.looks.save, { name: "X", theme: "neon" })).rejects.toThrow(/INVALID_LOOK: That theme is not available/);
  });
});

async function carousel(t: TestConvex, over: Record<string, unknown> = {}) {
  const topic = await insertTopic(t);
  const id = await t.run(async (ctx) =>
    ctx.db.insert("drafts", {
      topicId: topic,
      platform: "instagram",
      body: "Caption",
      templateKey: "carousel-slides",
      templateVersion: 1,
      format: "carousel",
      slides: placeholderSlides(3).map((s) => ({ ...s, headline: "A slide" })),
      charCount: 7,
      constraintOk: true,
      createdAt: Date.now(),
      ...over,
    })
  );
  return { topic, id };
}

describe("drafts.setTheme", () => {
  it("changes the design, detaches the drawn images, and clears it again for Solo Queue", async () => {
    const t = newTest();
    const { id } = await carousel(t);
    const imgs = await t.run(async (ctx) => {
      const ids: Id<"mediaAssets">[] = [];
      for (let i = 0; i < 3; i += 1) {
        ids.push(await ctx.db.insert("mediaAssets", { storageId: `external:${i}`, publicUrl: `https://f.example/${i}.png`, mimeType: "image/png", source: "external", createdAt: Date.now() }));
      }
      return ids;
    });
    await t.mutation(api.drafts.attachCarouselMedia, { id, mediaAssetIds: imgs });
    await t.mutation(api.drafts.setTheme, { id, theme: "kraft-zine" });
    let row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.theme).toBe("kraft-zine");
    expect(row?.mediaAssetIds).toBeUndefined();
    expect(row?.mediaAssetId).toBeUndefined();

    await t.mutation(api.drafts.attachCarouselMedia, { id, mediaAssetIds: imgs });
    // The same theme again changes nothing, so the images stay.
    await t.mutation(api.drafts.setTheme, { id, theme: "kraft-zine" });
    expect((await t.run((ctx) => ctx.db.get(id)))?.mediaAssetIds).toEqual(imgs);

    await t.mutation(api.drafts.setTheme, { id, theme: "solo-queue" });
    row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.theme).toBeUndefined();
    expect(row?.mediaAssetIds).toBeUndefined();
    await t.mutation(api.drafts.setTheme, { id });
    expect((await t.run((ctx) => ctx.db.get(id)))?.theme).toBeUndefined();
  });

  it("refuses an unknown theme, a draft that is not a written carousel, and a carousel that already has a post", async () => {
    const t = newTest();
    const { topic, id } = await carousel(t);
    await expect(t.mutation(api.drafts.setTheme, { id, theme: "neon" })).rejects.toThrow(/THEME_NOT_FOUND/);

    const plain = await t.run(async (ctx) =>
      ctx.db.insert("drafts", { topicId: topic, platform: "instagram", body: "x", templateKey: "ig-caption-beats", templateVersion: 1, charCount: 1, constraintOk: true, createdAt: Date.now() })
    );
    await expect(t.mutation(api.drafts.setTheme, { id: plain, theme: "kraft-zine" })).rejects.toThrow(/NOT_A_CAROUSEL/);

    const own = await carousel(t, { slideSource: "uploaded" });
    await expect(t.mutation(api.drafts.setTheme, { id: own.id, theme: "kraft-zine" })).rejects.toThrow(/OWN_IMAGES/);

    await insertSlot(t, id, Date.now() + 3_600_000, { platform: "instagram" });
    await expect(t.mutation(api.drafts.setTheme, { id, theme: "kraft-zine" })).rejects.toThrow(/CAROUSEL_QUEUED/);
  });
});
