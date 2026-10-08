import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { validateSlide } from "./lib/carouselSlides";
import { placeholderSlides } from "./lib/ownCarousel";
import { insertSlot, insertTopic, newTest, type TestConvex } from "../src/test-utils/convex";

/** `n` library images the founder uploaded: checked reachable just now, PNG unless told otherwise. */
async function uploads(t: TestConvex, n: number, over: { mimeType?: string } = {}): Promise<Id<"mediaAssets">[]> {
  return await t.run(async (ctx) => {
    const ids: Id<"mediaAssets">[] = [];
    for (let i = 0; i < n; i += 1) {
      ids.push(
        await ctx.db.insert("mediaAssets", {
          storageId: `external:${i}`,
          publicUrl: `https://files.example/own-${i}.png`,
          mimeType: over.mimeType ?? "image/png",
          source: "upload",
          verifiedAt: Date.now(),
          createdAt: Date.now(),
        })
      );
    }
    return ids;
  });
}

const draftsOf = (t: TestConvex, topic: Id<"topics">) =>
  t.run(async (ctx) => (await ctx.db.query("drafts").collect()).filter((d) => d.topicId === topic && d.templateKey === "carousel-slides"));

describe("a carousel made from the founder's own images", () => {
  it("is stored with one placeholder slide per image, in order, the first image as the cover", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const images = await uploads(t, 3);
    const id = await t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "My caption #one", mediaAssetIds: images });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ platform: "instagram", format: "carousel", templateKey: "carousel-slides", slideSource: "uploaded", body: "My caption #one" });
    expect(row?.mediaAssetIds).toEqual(images);
    expect(row?.mediaAssetId).toBe(images[0]);
    expect(row?.slides).toHaveLength(3);
    // The placeholders are valid slides, so everything that reads `slides` keeps working.
    for (const s of row?.slides ?? []) expect(validateSlide(s).ok).toBe(true);
    expect(placeholderSlides(2).map((s) => s.headline)).toEqual(["Your image 1", "Your image 2"]);
  });

  it("needs a caption and 2 to 10 images, each its own PNG or JPEG file that is still there", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const ten = await uploads(t, 11);
    await expect(t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "  ", mediaAssetIds: ten.slice(0, 3) })).rejects.toThrow(/EMPTY_DRAFT/);
    await expect(t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "c", mediaAssetIds: ten.slice(0, 1) })).rejects.toThrow(/BAD_IMAGE_COUNT/);
    await expect(t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "c", mediaAssetIds: [] })).rejects.toThrow(/BAD_IMAGE_COUNT/);
    await expect(t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "c", mediaAssetIds: ten })).rejects.toThrow(/BAD_IMAGE_COUNT/);
    await expect(t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "c", mediaAssetIds: [ten[0], ten[0]] })).rejects.toThrow(/SLIDE_IMAGE_DUPLICATE/);
    const gifs = await uploads(t, 2, { mimeType: "image/gif" });
    await expect(t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "c", mediaAssetIds: gifs })).rejects.toThrow(/SLIDE_IMAGE_TYPE: Image 1/);
    await t.run(async (ctx) => ctx.db.patch(ten[1], { fileDeletedAt: Date.now() }));
    await expect(t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "c", mediaAssetIds: ten.slice(0, 2) })).rejects.toThrow(/MEDIA_REMOVED/);
    expect(await draftsOf(t, topic)).toHaveLength(0);
    // Ten is the most.
    await t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "c", mediaAssetIds: [ten[0], ...ten.slice(2, 10)] });
    expect((await draftsOf(t, topic))[0].slides).toHaveLength(9);
  });

  it("replaces an unqueued carousel of the topic, and leaves one that already has a post alone", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const first = await t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "one", mediaAssetIds: await uploads(t, 2) });
    const second = await t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "two", mediaAssetIds: await uploads(t, 3) });
    const now = await draftsOf(t, topic);
    expect(now.map((d) => d._id)).toEqual([second]);
    expect(await t.run((ctx) => ctx.db.get(first))).toBeNull();

    await insertSlot(t, second, Date.now() + 3_600_000, { platform: "instagram" });
    const third = await t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "three", mediaAssetIds: await uploads(t, 2) });
    expect((await draftsOf(t, topic)).map((d) => d._id).sort()).toEqual([second, third].sort());
  });

  it("images can be added, removed and reordered, down to 2 and up to 10; the files stay in the library", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const images = await uploads(t, 4);
    const id = await t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "c", mediaAssetIds: images.slice(0, 3) });

    await t.mutation(api.drafts.setOwnCarouselImages, { id, mediaAssetIds: [images[2], images[0], images[1], images[3]] });
    let row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.mediaAssetIds).toEqual([images[2], images[0], images[1], images[3]]);
    expect(row?.mediaAssetId).toBe(images[2]);
    expect(row?.slides).toHaveLength(4);

    await t.mutation(api.drafts.setOwnCarouselImages, { id, mediaAssetIds: [images[1], images[3]] });
    row = await t.run((ctx) => ctx.db.get(id));
    expect(row?.slides).toHaveLength(2);
    await expect(t.mutation(api.drafts.setOwnCarouselImages, { id, mediaAssetIds: [images[1]] })).rejects.toThrow(/BAD_IMAGE_COUNT/);
    // A removed image is still in the library and can be used again.
    expect(await t.run((ctx) => ctx.db.get(images[0]))).not.toBeNull();
  });

  it("is protected like a written carousel: no slide edits or drawing over it, not changeable once it has a post, and not for other drafts", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const images = await uploads(t, 3);
    const id = await t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "c", mediaAssetIds: images });
    await expect(t.mutation(api.drafts.updateSlides, { id, slides: placeholderSlides(2) })).rejects.toThrow(/OWN_IMAGES/);
    await expect(t.mutation(api.drafts.attachCarouselMedia, { id, mediaAssetIds: images })).rejects.toThrow(/OWN_IMAGES/);

    const written = await t.run(async (ctx) =>
      ctx.db.insert("drafts", { topicId: topic, platform: "instagram", body: "x", templateKey: "carousel-slides", templateVersion: 1, format: "carousel", slides: placeholderSlides(2), charCount: 1, constraintOk: true, createdAt: Date.now() })
    );
    await expect(t.mutation(api.drafts.setOwnCarouselImages, { id: written, mediaAssetIds: images.slice(0, 2) })).rejects.toThrow(/NOT_OWN_CAROUSEL/);

    await insertSlot(t, id, Date.now() + 3_600_000, { platform: "instagram" });
    await expect(t.mutation(api.drafts.setOwnCarouselImages, { id, mediaAssetIds: images.slice(0, 2) })).rejects.toThrow(/CAROUSEL_QUEUED/);
  });

  it("queues like any carousel once its images are checked, and its caption is edited the usual way", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const images = await uploads(t, 3);
    const id = await t.mutation(api.drafts.createOwnCarousel, { topicId: topic, caption: "First caption", mediaAssetIds: images });
    await t.mutation(api.drafts.update, { id, body: "Edited caption #tag" });
    expect((await t.run((ctx) => ctx.db.get(id)))?.body).toBe("Edited caption #tag");

    await t.run(async (ctx) => ctx.db.patch(images[1], { verifiedAt: undefined }));
    await expect(t.mutation(api.slots.enqueue, { draftId: id })).rejects.toThrow(/MEDIA_UNVERIFIED: The image for slide 2/);
    await t.run(async (ctx) => ctx.db.patch(images[1], { verifiedAt: Date.now() }));
    const out = await t.mutation(api.slots.enqueue, { draftId: id });
    const slots = await t.run((ctx) => ctx.db.query("slots").collect());
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ _id: out.slotId, platform: "instagram", status: "scheduled", draftId: id });

    // The Queue shows every image and the slide count.
    const board = await t.query(api.queueBoard.detail, { id: out.slotId });
    expect(board?.draft?.slideCount).toBe(3);
    expect(board?.slideMedia).toHaveLength(3);
  });
});
