import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const platform = v.union(v.literal("threads"), v.literal("instagram"));

export default defineSchema({
  // One row per platform (threads | instagram). Tokens live here, backend-only.
  connections: defineTable({
    platform,
    platformUserId: v.string(), // threads-user-id / ig-id
    handle: v.string(), // display handle, for dashboard
    accessToken: v.string(), // long-lived token, backend-only
    tokenExpiresAt: v.number(), // unix ms; refresh before this
    scopes: v.array(v.string()), // granted permissions
    status: v.union(
      v.literal("healthy"),
      v.literal("expiring"),
      v.literal("failed")
    ),
    lastCheckedAt: v.number(),
    lastError: v.optional(v.string()),
  }).index("by_platform", ["platform"]),

  // Versioned story/script structures the LLM fills (never invents the voice).
  templates: defineTable({
    key: v.string(), // e.g. "threads-hook-story", "ig-caption-beats", "reel-script"
    version: v.number(),
    body: v.string(), // template text with {{slots}}
    isActive: v.boolean(),
    createdAt: v.number(),
  }),

  // Research capture: one topic, rough notes/link.
  topics: defineTable({
    title: v.string(),
    notes: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    status: v.union(
      v.literal("drafting"),
      v.literal("ready"),
      v.literal("queued"),
      v.literal("done")
    ),
    createdAt: v.number(),
  }).index("by_status_created", ["status", "createdAt"]),

  // Generated platform outputs for a topic.
  drafts: defineTable({
    topicId: v.id("topics"),
    platform: v.union(platform, v.literal("blog")),
    body: v.string(),
    mediaAssetId: v.optional(v.id("mediaAssets")),
    templateKey: v.string(),
    templateVersion: v.number(),
    charCount: v.number(), // live constraint feedback
    constraintOk: v.boolean(),
    createdAt: v.number(),
  }).index("by_topic_platform", ["topicId", "platform"]),

  // The queue: one scheduled publish per platform.
  slots: defineTable({
    platform,
    draftId: v.id("drafts"),
    scheduledAt: v.number(), // unix ms; cron claims where scheduledAt <= now
    status: v.union(
      v.literal("scheduled"),
      v.literal("claimed"),
      v.literal("published"),
      v.literal("failed")
    ),
    attempts: v.number(), // retry counter
    lastError: v.optional(v.string()),
    publishedPlatformId: v.optional(v.string()), // returned media/post id
    createdAt: v.number(),
  }).index("by_platform_status_scheduled", [
    "platform",
    "status",
    "scheduledAt",
  ]),

  // Convex file storage refs with public URLs (required at publish time).
  mediaAssets: defineTable({
    storageId: v.string(), // Convex _storage id
    publicUrl: v.string(), // must be reachable at queue time AND publish time
    mimeType: v.string(),
    verifiedAt: v.optional(v.number()), // last successful reachability check
    createdAt: v.number(),
  }),

  // Append-only log per publish attempt.
  publishReceipts: defineTable({
    slotId: v.id("slots"),
    attemptedAt: v.number(),
    outcome: v.union(
      v.literal("success"),
      v.literal("retryable"),
      v.literal("permanent")
    ),
    providerMessage: v.optional(v.string()),
  }),
});
