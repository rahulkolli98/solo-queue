import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { filenameFromUrl } from "./media";
import { insertDraft, insertTopic, newTest } from "../src/test-utils/convex";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("media library", () => {
  it("registers an external URL with a filename and source, and refuses non-http URLs", async () => {
    const t = newTest();
    const id = await t.mutation(api.media.registerExternal, {
      url: " https://cdn.example.com/pics/Cover%20One.jpg ",
      mimeType: "image/jpeg",
    });
    const row = await t.run(async (ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ source: "external", filename: "Cover One.jpg", publicUrl: "https://cdn.example.com/pics/Cover%20One.jpg" });
    await expect(
      t.mutation(api.media.registerExternal, { url: "javascript:alert(1)", mimeType: "image/png" })
    ).rejects.toThrow(/BAD_URL/);
    await expect(
      t.mutation(api.media.registerExternal, { url: "https://x.test/a.pdf", mimeType: "application/pdf" })
    ).rejects.toThrow(/BAD_MEDIA/);
  });

  it("verify stamps verifiedAt on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    const t = newTest();
    const id = await t.mutation(api.media.registerExternal, { url: "https://cdn.example.com/a.jpg", mimeType: "image/jpeg" });
    expect(await t.action(api.media.verify, { id })).toEqual({ status: 200 });
    const row = await t.run(async (ctx) => ctx.db.get(id));
    expect(row?.verifiedAt).toBeTypeOf("number");
    expect(row?.lastVerifyError).toBeUndefined();
  });

  it("verify failure is stored on the asset and a later success clears it", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const t = newTest();
    const id = await t.mutation(api.media.registerExternal, { url: "https://cdn.example.com/gone.jpg", mimeType: "image/jpeg" });
    await expect(t.action(api.media.verify, { id })).rejects.toThrow(/not reachable/);
    let row = await t.run(async (ctx) => ctx.db.get(id));
    expect(row?.lastVerifyError).toMatch(/URL not reachable/);
    expect(row?.verifiedAt).toBeUndefined();

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    await t.action(api.media.verify, { id });
    row = await t.run(async (ctx) => ctx.db.get(id));
    expect(row?.lastVerifyError).toBeUndefined();
    expect(row?.verifiedAt).toBeTypeOf("number");
  });

  it("list reports how many drafts use each asset, and remove refuses while one does", async () => {
    const t = newTest();
    const id = await t.mutation(api.media.registerExternal, { url: "https://cdn.example.com/a.jpg", mimeType: "image/jpeg" });
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic, "instagram", "caption", "ig-caption-beats");
    await t.mutation(api.drafts.attachMedia, { id: draft, mediaAssetId: id });
    expect((await t.query(api.media.list, {}))[0].usedBy).toBe(1);
    await expect(t.mutation(api.media.remove, { id })).rejects.toThrow(/IN_USE/);

    await t.mutation(api.drafts.attachMedia, { id: draft, mediaAssetId: null });
    await t.mutation(api.media.remove, { id });
    expect(await t.query(api.media.list, {})).toEqual([]);
  });
});

describe("filenameFromUrl", () => {
  it("uses the last path segment, else the host", () => {
    expect(filenameFromUrl("https://a.test/x/y/photo.png?x=1")).toBe("photo.png");
    expect(filenameFromUrl("https://a.test/")).toBe("a.test");
    expect(filenameFromUrl("not a url")).toBe("not a url");
  });
});
