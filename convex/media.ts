import { ConvexError, v } from "convex/values";
import { operatorAction, operatorMutation, operatorQuery } from "./lib/operator";
import { internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { checkReachable } from "./lib/http";
import { refusal } from "./lib/slots";

const MAX_BYTES = 50 * 1024 * 1024;

function requireVisualMime(mimeType: string) {
  if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
    throw refusal("BAD_MEDIA", "Only images and videos can be queued to Instagram.");
  }
}

function requireHttpUrl(url: string): string {
  const trimmed = url.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw refusal("BAD_URL", "That doesn't look like a URL (needs http:// or https://).");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw refusal("BAD_URL", "Only http:// and https:// URLs can be verified.");
  }
  return trimmed;
}

/** A readable file name for an external URL (last path segment, else the host). */
export function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : u.hostname;
  } catch {
    return url;
  }
}

/** Drafts that use an asset (bounded scan: a personal library). */
async function draftsUsing(ctx: QueryCtx, assetId: Id<"mediaAssets">): Promise<Doc<"drafts">[]> {
  const drafts = await ctx.db.query("drafts").order("desc").take(1000);
  return drafts.filter((d) => d.mediaAssetId === assetId);
}

/** Newest assets first, bounded, each with how many drafts use it. */
export const list = operatorQuery({
  args: {},
  handler: async (ctx) => {
    const assets = await ctx.db.query("mediaAssets").order("desc").take(50);
    const drafts = await ctx.db.query("drafts").order("desc").take(1000);
    const uses = new Map<string, number>();
    for (const d of drafts) {
      if (d.mediaAssetId) uses.set(d.mediaAssetId, (uses.get(d.mediaAssetId) ?? 0) + 1);
    }
    return assets.map((a) => ({ ...a, usedBy: uses.get(a._id) ?? 0 }));
  },
});

/**
 * Specific assets by id (a draft's attached media), so a draft whose asset is
 * older than the newest 50 in `list` still resolves. Missing ids are left out.
 */
export const byIds = operatorQuery({
  args: { ids: v.array(v.id("mediaAssets")) },
  handler: async (ctx, args) => {
    const out: Doc<"mediaAssets">[] = [];
    for (const id of args.ids.slice(0, 10)) {
      const asset = await ctx.db.get(id);
      if (asset) out.push(asset);
    }
    return out;
  },
});

/** Short-lived URL the browser POSTs a file to (Convex storage upload). */
export const generateUploadUrl = operatorMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/** Record an uploaded file as a library asset with its public URL. */
export const store = operatorMutation({
  args: { storageId: v.id("_storage"), mimeType: v.string(), filename: v.optional(v.string()) },
  handler: async (ctx, args) => {
    requireVisualMime(args.mimeType);
    const meta = await ctx.db.system.get("_storage", args.storageId);
    if (!meta) throw refusal("UPLOAD_MISSING", "Upload not found — try uploading again.");
    if (meta.size > MAX_BYTES)
      throw refusal("TOO_BIG", "File is too big (50 MB max for Instagram-bound media).");
    const publicUrl = await ctx.storage.getUrl(args.storageId);
    if (!publicUrl) throw refusal("NO_URL", "Couldn't make a public URL for that upload.");
    return await ctx.db.insert("mediaAssets", {
      storageId: args.storageId,
      publicUrl,
      mimeType: meta.contentType ?? args.mimeType,
      filename: args.filename?.trim().slice(0, 200) || undefined,
      source: "upload",
      createdAt: Date.now(),
    });
  },
});

/** Register a hosted (non-uploaded) URL — e.g. stock media — for verification. */
export const registerExternal = operatorMutation({
  args: { url: v.string(), mimeType: v.string() },
  handler: async (ctx, args) => {
    requireVisualMime(args.mimeType);
    const publicUrl = requireHttpUrl(args.url);
    return await ctx.db.insert("mediaAssets", {
      storageId: `external:${publicUrl}`,
      publicUrl,
      mimeType: args.mimeType,
      filename: filenameFromUrl(publicUrl).slice(0, 200),
      source: "external",
      createdAt: Date.now(),
    });
  },
});

export const markVerified = internalMutation({
  args: { id: v.id("mediaAssets") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { verifiedAt: Date.now(), lastVerifyError: undefined });
    return null;
  },
});

/** Remember why the last check failed so the Library can show it after a reload. */
export const markVerifyFailed = internalMutation({
  args: { id: v.id("mediaAssets"), error: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { verifiedAt: undefined, lastVerifyError: args.error.slice(0, 300) });
    return null;
  },
});

/**
 * Probe an asset's public URL. On success stamps verifiedAt and clears any
 * earlier error. On failure the reason is stored on the asset (shown as "not
 * reachable" in Library > Media) and a readable error is thrown.
 */
export const verify = operatorAction({
  args: { id: v.id("mediaAssets") },
  handler: async (ctx, args): Promise<{ status: number }> => {
    const asset: {
      publicUrl: string;
    } | null = await ctx.runQuery(internal.media.getForVerify, { id: args.id });
    if (!asset) throw refusal("MEDIA_NOT_FOUND", "Media not found — it may have been deleted.");
    try {
      const status = await checkReachable(asset.publicUrl);
      await ctx.runMutation(internal.media.markVerified, { id: args.id });
      return { status };
    } catch (err) {
      const message = err instanceof Error ? err.message : "URL not reachable.";
      await ctx.runMutation(internal.media.markVerifyFailed, { id: args.id, error: message });
      throw new ConvexError(message);
    }
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

/**
 * Delete the asset doc and its stored file (external URLs have no file).
 * Refused while a draft uses it: a queued post must not lose its media.
 */
export const remove = operatorMutation({
  args: { id: v.id("mediaAssets") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) return null;
    const users = await draftsUsing(ctx, args.id);
    if (users.length > 0) {
      throw refusal(
        "IN_USE",
        `${users.length} draft${users.length === 1 ? " uses" : "s use"} this file. Detach it first.`
      );
    }
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
