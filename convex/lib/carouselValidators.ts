import { v } from "convex/values";

/**
 * The Convex validator for one carousel slide (`drafts.slides`). It mirrors `slideSchema` in carouselSlides.ts:
 * that one checks what the founder or the model writes, this one is what the database stores. Keep them in step;
 * `carouselSlides.test.ts` stores a slide of every layout to prove they agree.
 */
const tone = v.union(
  v.literal("coral"),
  v.literal("cream"),
  v.literal("ink"),
  v.literal("pink"),
  v.literal("yellow"),
  v.literal("blue")
);

export const slideValidator = v.object({
  layout: v.union(v.literal("cover"), v.literal("cards"), v.literal("list"), v.literal("close"), v.literal("statement")),
  tone,
  kicker: v.optional(v.string()),
  headline: v.string(),
  accent: v.optional(v.string()),
  sub: v.optional(v.string()),
  cards: v.optional(
    v.array(
      v.object({
        label: v.optional(v.string()),
        big: v.optional(v.string()),
        text: v.string(),
        tone,
      })
    )
  ),
  items: v.optional(v.array(v.object({ label: v.optional(v.string()), text: v.string() }))),
  pills: v.optional(v.array(v.string())),
  tag: v.optional(v.string()),
  note: v.optional(v.string()),
});
