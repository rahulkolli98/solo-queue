import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { VERIFIED_TTL_MS, assertFileNotRemoved, refusal } from "./slots";

/**
 * The images behind a carousel, checked the way a single post's image is: one per slide, each stored, not removed,
 * a PNG or JPEG, and (when `fresh`) verified reachable within the last day. Returned in slide order.
 *
 * `fresh` is for queueing and rescheduling a post; a requeue of something already published only needs the files to
 * still be there.
 */
export async function loadCarouselAssets(
  ctx: Pick<QueryCtx, "db">,
  draft: Pick<Doc<"drafts">, "slides" | "mediaAssetIds">,
  opts: { fresh: boolean; now?: number } = { fresh: true }
): Promise<Doc<"mediaAssets">[]> {
  const slides = draft.slides?.length ?? 0;
  const ids = draft.mediaAssetIds ?? [];
  if (slides === 0) throw refusal("NOT_A_CAROUSEL", "This draft has no slides.");
  if (ids.length !== slides) {
    throw refusal(
      "MEDIA_REQUIRED",
      ids.length === 0
        ? "Draw the slides first: a carousel needs one image per slide."
        : `This carousel has ${slides} slides but ${ids.length} images. Draw the slides again.`
    );
  }
  const assets: Doc<"mediaAssets">[] = [];
  for (const [i, id] of ids.entries()) {
    const asset = await ctx.db.get(id);
    if (!asset) throw refusal("MEDIA_MISSING", `The image for slide ${i + 1} is gone — draw the slides again.`);
    assertFileNotRemoved(asset);
    if (asset.mimeType !== "image/png" && asset.mimeType !== "image/jpeg") {
      throw refusal("SLIDE_IMAGE_TYPE", `Slide ${i + 1} is not a PNG or JPEG file — draw the slides again.`);
    }
    if (opts.fresh) {
      if (!asset.verifiedAt) {
        throw refusal("MEDIA_UNVERIFIED", `The image for slide ${i + 1} isn't checked yet — press Check the images.`);
      }
      if ((opts.now ?? Date.now()) - asset.verifiedAt > VERIFIED_TTL_MS) {
        throw refusal("MEDIA_STALE", "The slide images were checked more than a day ago — press Check the images.");
      }
    }
    assets.push(asset);
  }
  return assets;
}
