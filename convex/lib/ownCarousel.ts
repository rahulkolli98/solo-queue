import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { MAX_SLIDES, type Slide } from "./carouselSlides";
import { assertFileNotRemoved, refusal } from "./slots";

/**
 * A carousel the founder made themselves: their own PNG or JPEG images, in order, plus a caption. There are no
 * slides to write or draw, but everything downstream (counts, readiness, the Queue, Instagram) reads a carousel as
 * "a draft with slides", so the draft keeps one placeholder slide per image and is marked `slideSource: "uploaded"`.
 * The placeholders are never shown or drawn; only the editor needs to know the difference.
 */

/** Two images make a carousel; one image is an ordinary photo post. */
export const OWN_MIN_IMAGES = 2;
export const OWN_MAX_IMAGES = MAX_SLIDES;

/** One placeholder slide per image, so the slide count is the image count. */
export function placeholderSlides(count: number): Slide[] {
  return Array.from({ length: count }, (_, i) => ({ layout: "cover" as const, tone: "ink" as const, headline: `Your image ${i + 1}` }));
}

/** The images of an own carousel: 2 to 10, each its own file, stored, not removed, and a PNG or JPEG (what Instagram takes). */
export async function assertOwnImages(ctx: Pick<QueryCtx, "db">, ids: readonly Id<"mediaAssets">[]): Promise<void> {
  if (ids.length < OWN_MIN_IMAGES || ids.length > OWN_MAX_IMAGES) {
    throw refusal("BAD_IMAGE_COUNT", `A carousel has ${OWN_MIN_IMAGES} to ${OWN_MAX_IMAGES} images. You sent ${ids.length}.`);
  }
  if (new Set(ids).size !== ids.length) {
    throw refusal("SLIDE_IMAGE_DUPLICATE", "Each slide needs its own image. The same file is in the list twice.");
  }
  for (const [i, id] of ids.entries()) {
    const asset = await ctx.db.get(id);
    if (!asset) throw refusal("MEDIA_MISSING", `Image ${i + 1} is gone from your library. Upload it again.`);
    assertFileNotRemoved(asset);
    if (asset.mimeType !== "image/png" && asset.mimeType !== "image/jpeg") {
      throw refusal("SLIDE_IMAGE_TYPE", `Image ${i + 1} is not a PNG or JPEG file. Instagram carousels need PNG or JPEG.`);
    }
  }
}
