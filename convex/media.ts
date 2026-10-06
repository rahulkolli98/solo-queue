import { ConvexError, v } from "convex/values";
import { operatorAction, operatorMutation, operatorQuery } from "./lib/operator";
import { internalMutation, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { judgeMedia, probeUrl } from "./lib/http";
import { assertFileNotRemoved, refusal } from "./lib/slots";
import { readSettings } from "./lib/settingsDb";

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
    if (!publicUrl) throw refusal("NO_URL", "No public URL for that upload. Upload the file again.");
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
  args: { id: v.id("mediaAssets"), mimeType: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      verifiedAt: Date.now(),
      lastVerifyError: undefined,
      // Keep the type the server reports, so Instagram gets the right kind (photo or reel).
      ...(args.mimeType ? { mimeType: args.mimeType } : {}),
    });
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
 * Probe an asset's public URL. It must serve an image or video file (a web
 * page such as a YouTube link is refused). On success stamps verifiedAt and
 * clears any earlier error. On failure the reason is stored on the asset (shown as "not
 * reachable" in Library > Media) and a readable error is thrown.
 */
export const verify = operatorAction({
  args: { id: v.id("mediaAssets") },
  handler: async (ctx, args): Promise<{ status: number }> => {
    const asset: {
      publicUrl: string;
      fileDeletedAt?: number;
    } | null = await ctx.runQuery(internal.media.getForVerify, { id: args.id });
    if (!asset) throw refusal("MEDIA_NOT_FOUND", "Media not found — it may have been deleted.");
    assertFileNotRemoved(asset);
    try {
      const probe = await probeUrl(asset.publicUrl);
      const verdict = judgeMedia(asset.publicUrl, probe);
      if (!verdict.ok) throw new Error(verdict.reason);
      await ctx.runMutation(internal.media.markVerified, { id: args.id, mimeType: verdict.mimeType });
      return { status: probe.status };
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
    return { publicUrl: doc.publicUrl, fileDeletedAt: doc.fileDeletedAt };
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

/**
 * How much hosted (uploaded) media is stored: file count and total bytes, read
 * from Convex's file metadata. External-URL assets, assets whose file the
 * cleanup removed, and rows whose file is gone count 0.
 */
export const storageSummary = operatorQuery({
  args: {},
  handler: async (ctx): Promise<{ files: number; bytes: number }> => {
    let files = 0;
    let bytes = 0;
    for await (const asset of ctx.db.query("mediaAssets")) {
      if (asset.fileDeletedAt !== undefined || asset.storageId.startsWith("external:")) continue;
      const storageId = ctx.db.system.normalizeId("_storage", asset.storageId);
      const meta = storageId ? await ctx.db.system.get("_storage", storageId) : null;
      if (!meta) continue;
      files += 1;
      bytes += meta.size;
    }
    return { files, bytes };
  },
});

const DAY_MS = 86_400_000;
/** Cleanup reads every draft so it knows each asset's full use; past this it does nothing rather than guess. */
const CLEANUP_MAX_DRAFTS = 3000;

export type CleanupResult =
  | { status: "off" }
  | { status: "skipped"; reason: "too_many_drafts" }
  | { status: "done"; deleted: number };

/**
 * Opt-in cleanup of hosted files after publishing (daily cron). Does nothing
 * unless settings.media.cleanupAfterDays is a number N. Then it removes the
 * stored FILE of an uploaded asset (the row stays, stamped fileDeletedAt) only
 * when all of these hold:
 *  - at least one draft uses it, and every draft that uses it has at least one slot;
 *  - every slot of those drafts is `published` (a scheduled, claimed or failed slot keeps it);
 *  - the newest publish is more than N days old;
 *  - no source (research screenshot) uses it.
 * `now` is optional so tests can pin the clock.
 */
export const cleanupPublished = internalMutation({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<CleanupResult> => {
    const days = (await readSettings(ctx)).media.cleanupAfterDays;
    if (typeof days !== "number" || !Number.isFinite(days) || days <= 0) return { status: "off" };
    const cutoff = (args.now ?? Date.now()) - days * DAY_MS;

    const drafts = await ctx.db.query("drafts").take(CLEANUP_MAX_DRAFTS + 1);
    if (drafts.length > CLEANUP_MAX_DRAFTS) return { status: "skipped", reason: "too_many_drafts" };
    const byAsset = new Map<Id<"mediaAssets">, Doc<"drafts">[]>();
    for (const d of drafts) {
      if (!d.mediaAssetId) continue;
      byAsset.set(d.mediaAssetId, [...(byAsset.get(d.mediaAssetId) ?? []), d]);
    }
    if (byAsset.size === 0) return { status: "done", deleted: 0 };

    const sourceAssets = new Set<string>();
    for await (const s of ctx.db.query("sources")) {
      if (s.mediaAssetId) sourceAssets.add(s.mediaAssetId);
    }

    let deleted = 0;
    for (const [assetId, users] of byAsset) {
      if (sourceAssets.has(assetId)) continue;
      const asset = await ctx.db.get(assetId);
      if (!asset || asset.fileDeletedAt !== undefined || asset.storageId.startsWith("external:")) continue;

      let newestPublish = 0;
      let safe = true;
      for (const draft of users) {
        const slots = await ctx.db
          .query("slots")
          .withIndex("by_draft", (q) => q.eq("draftId", draft._id))
          .take(101);
        // No slot, an unfinished slot, or too many slots to be sure: keep the file.
        if (slots.length === 0 || slots.length > 100 || slots.some((s) => s.status !== "published")) {
          safe = false;
          break;
        }
        for (const s of slots) newestPublish = Math.max(newestPublish, s.publishedAt ?? s.scheduledAt);
      }
      if (!safe || newestPublish === 0 || newestPublish > cutoff) continue;

      try {
        await ctx.storage.delete(asset.storageId as Id<"_storage">);
      } catch {
        // File already gone: still record it so the Library shows "removed".
      }
      await ctx.db.patch(assetId, { fileDeletedAt: args.now ?? Date.now() });
      deleted += 1;
    }
    return { status: "done", deleted };
  },
});
