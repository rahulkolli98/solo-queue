import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { checkReachable } from "./lib/http";

const MAX_BYTES = 50 * 1024 * 1024;

function requireVisualMime(mimeType: string) {
  if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
    throw new Error("Only images and videos can be queued to Instagram.");
  }
}

function requireHttpUrl(url: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("That doesn't look like a URL (needs http:// or https://).");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs can be verified.");
  }
  return trimmed;
}

/** Newest assets first, bounded — the library never needs the full history. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("mediaAssets").order("desc").take(50);
  },
});

/** Short-lived URL the browser POSTs a file to (Convex storage upload). */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Record an uploaded file as a library asset with its public URL. */
export const store = mutation({
  args: { storageId: v.id("_storage"), mimeType: v.string() },
  handler: async (ctx, args) => {
    requireVisualMime(args.mimeType);
    const meta = await ctx.db.system.get("_storage", args.storageId);
    if (!meta) throw new Error("Upload not found — try uploading again.");
    if (meta.size > MAX_BYTES)
      throw new Error("File is too big (50 MB max for Instagram-bound media).");
    const publicUrl = await ctx.storage.getUrl(args.storageId);
    if (!publicUrl) throw new Error("Couldn't make a public URL for that upload.");
    const now = Date.now();
    return await ctx.db.insert("mediaAssets", {
      storageId: args.storageId,
      publicUrl,
      mimeType: meta.contentType ?? args.mimeType,
      createdAt: now,
    });
  },
});

/** Register a hosted (non-uploaded) URL — e.g. stock media — for verification. */
export const registerExternal = mutation({
  args: { url: v.string(), mimeType: v.string() },
  handler: async (ctx, args) => {
    requireVisualMime(args.mimeType);
    const publicUrl = requireHttpUrl(args.url);
    return await ctx.db.insert("mediaAssets", {
      storageId: `external:${publicUrl}`,
      publicUrl,
      mimeType: args.mimeType,
      createdAt: Date.now(),
    });
  },
});

export const markVerified = internalMutation({
  args: { id: v.id("mediaAssets") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { verifiedAt: Date.now() });
    return null;
  },
});

/**
 * Probe an asset's public URL. Throws with a human message when unreachable
 * (the enqueue validator in TASK-022 surfaces this); stamps verifiedAt on ok.
 */
export const verify = action({
  args: { id: v.id("mediaAssets") },
  handler: async (ctx, args): Promise<{ status: number }> => {
    const asset: {
      publicUrl: string;
    } | null = await ctx.runQuery(internal.media.getForVerify, { id: args.id });
    if (!asset) throw new Error("Media not found — it may have been deleted.");
    const status = await checkReachable(asset.publicUrl);
    await ctx.runMutation(internal.media.markVerified, { id: args.id });
    return { status };
  },
});

/** Internal read for the verify action (keeps the action off ctx.db). */
export const getForVerify = internalQuery({
  args: { id: v.id("mediaAssets") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return null;
    return { publicUrl: doc.publicUrl };
  },
});

/** Delete the asset doc and its stored file (external URLs have no file). */
export const remove = mutation({
  args: { id: v.id("mediaAssets") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return null;
    if (!doc.storageId.startsWith("external:")) {
      try {
        await ctx.storage.delete(doc.storageId as Id<"_storage">);
      } catch {
        // File already gone — still drop the doc.
      }
    }
    await ctx.db.delete(args.id);
    return null;
  },
});
