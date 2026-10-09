import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { slideValidator } from "./lib/carouselValidators";

/** One format's saved default in Settings (see convex/lib/formatSetup.ts). */
const formatDefaultValidator = v.object({
  include: v.optional(v.boolean()),
  frameKey: v.optional(v.string()),
  count: v.optional(v.number()),
  /** Carousel only: the platforms it is written for and posted to (added 2026-10-09). Missing means Instagram only. */
  targets: v.optional(v.array(v.union(v.literal("instagram"), v.literal("threads")))),
});

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
  }).index("by_key", ["key"]),

  // Research capture: one topic, rough notes/link.
  topics: defineTable({
    title: v.string(),
    notes: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    pillar: v.optional(v.string()), // pillar key from appSettings.pillars; drafting defaults when unset
    // Research board (all optional: prod already holds topic rows).
    brief: v.optional(v.string()), // ~140-word summary of the sources (generated, editable)
    briefEditedAt: v.optional(v.number()), // set when the founder edits; regenerating must confirm first
    angles: v.optional(
      v.array(
        v.object({
          platform: v.string(),
          format: v.string(),
          frameKey: v.string(),
          title: v.string(),
        })
      )
    ),
    archivedAt: v.optional(v.number()),
    /**
     * Drafts are being written for this topic (or the last run failed), so a screen opened later, on this device or
     * another, can still show it (added 2026-10-09). Set when a run starts and cleared when it ends; a run that never
     * ended (the server stopped) is treated as over after a while.
     */
    generation: v.optional(
      v.object({
        /** The formats being written, by their generate names ("threads", "instagram-carousel", ...). */
        kinds: v.array(v.string()),
        startedAt: v.number(),
        status: v.union(v.literal("running"), v.literal("failed")),
        error: v.optional(v.string()),
        errorCode: v.optional(v.string()),
      })
    ),
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
    /** A carousel's slides (2 to 10, added 2026-10-07). `body` is its caption. */
    slides: v.optional(v.array(slideValidator)),
    /** A carousel's rendered slide images, in order (2 to 10). `mediaAssetId` stays the cover (the first). */
    mediaAssetIds: v.optional(v.array(v.id("mediaAssets"))),
    /** "uploaded": the founder's own images (added 2026-10-08). `slides` then holds one placeholder per image and is never shown or drawn. */
    slideSource: v.optional(v.literal("uploaded")),
    lookKey: v.optional(v.string()), // the carousel look it was written with (looks.key); soft reference
    /** The theme the carousel is drawn in (themes.ts); missing means the default, Solo Queue (added 2026-10-09). */
    theme: v.optional(v.string()),
    /**
     * Retired 2026-10-09: a carousel's own Threads text. A carousel now goes to Threads on the first post of a thread
     * (`carouselDraftId` on the thread), so nothing reads or writes this. Kept in the schema so rows that have it stay valid.
     */
    threadsText: v.optional(v.string()),
    /**
     * A thread whose first post carries a carousel: the carousel draft (an Instagram carousel of the same topic) whose
     * slide images go on that post. The images stay on the carousel; this only points at it (added 2026-10-09).
     */
    carouselDraftId: v.optional(v.id("drafts")),
    templateKey: v.string(),
    templateVersion: v.number(),
    frameKey: v.optional(v.string()), // story frame used (frames.key); soft reference
    format: v.optional(v.string()), // "thread" | "single" | "caption" | "reel" | "carousel" | "blog"
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
    publishedAt: v.optional(v.number()),
    evergreen: v.optional(v.boolean()), // eligible for Requeue after rules.evergreenRestDays
    claimedAt: v.optional(v.number()), // set when claimed; lets a reaper recover stuck claims
    containerId: v.optional(v.string()), // provider container id, kept so a retry resumes instead of re-posting
    originalScheduledAt: v.optional(v.number()), // the founder's chosen time, kept when a retry pushes scheduledAt later
    createdAt: v.number(),
  })
    .index("by_platform_status_scheduled", ["platform", "status", "scheduledAt"])
    .index("by_draft", ["draftId"])
    .index("by_status_and_publishedAt", ["status", "publishedAt"]),

  // Convex file storage refs with public URLs (required at publish time).
  mediaAssets: defineTable({
    storageId: v.string(), // Convex _storage id
    publicUrl: v.string(), // must be reachable at queue time AND publish time
    mimeType: v.string(),
    verifiedAt: v.optional(v.number()), // last successful reachability check
    filename: v.optional(v.string()),
    source: v.optional(v.union(v.literal("upload"), v.literal("external"))),
    lastVerifyError: v.optional(v.string()), // shown as "not reachable" in Library > Media
    // Set when the opt-in cleanup removed the stored file after publishing. The row stays
    // (history), storageId/publicUrl are left as they were and now point at nothing.
    fileDeletedAt: v.optional(v.number()),
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
  }).index("by_slot", ["slotId"]),

  // The clippings behind a topic (Research board).
  sources: defineTable({
    topicId: v.id("topics"),
    kind: v.union(
      v.literal("link"),
      v.literal("quote"),
      v.literal("screenshot"),
      v.literal("note")
    ),
    url: v.optional(v.string()),
    text: v.optional(v.string()), // quote text, note text, or fetched title
    label: v.string(), // e.g. "developers.facebook.com", "Your build log, 21 Sep"
    mediaAssetId: v.optional(v.id("mediaAssets")), // screenshots
    createdAt: v.number(),
  }).index("by_topic_and_createdAt", ["topicId", "createdAt"]),

  // Story frames: beat structures the drafting prompt follows (Library > Story frames).
  frames: defineTable({
    key: v.string(), // "confession", "hook-tension-turn-payoff", ...
    name: v.string(),
    beats: v.array(v.object({ label: v.string(), hint: v.string() })), // 3-5 beats
    fits: v.array(
      v.union(
        v.literal("thread"),
        v.literal("single"),
        v.literal("reel"),
        v.literal("carousel")
      )
    ),
    color: v.string(), // design token name, e.g. "pillar-build"
    /** For a carousel frame: the look, the tone and references to follow (added 2026-10-07). */
    style: v.optional(v.string()),
    usedCount: v.number(),
    version: v.number(),
    isActive: v.boolean(),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  // Carousel looks (added 2026-10-08): a saved design the founder picks per run. Any mix of a slide plan, a design
  // document and reference images; never a slide count or facts.
  looks: defineTable({
    key: v.string(),
    name: v.string(),
    plan: v.optional(
      v.array(
        v.object({
          layout: v.union(v.literal("cover"), v.literal("cards"), v.literal("list"), v.literal("close")),
          tone: v.union(v.literal("coral"), v.literal("cream"), v.literal("ink"), v.literal("pink"), v.literal("yellow"), v.literal("blue")),
        })
      )
    ),
    design: v.optional(v.string()),
    referenceIds: v.optional(v.array(v.id("mediaAssets"))),
    /** The theme (design) carousels written with this look are drawn in (themes.ts; added 2026-10-09). */
    theme: v.optional(v.string()),
    usedCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // The typed settings singleton (Settings sections). One row, created on first read.
  // Named appSettings because prod already has a legacy key/value table called `settings`.
  appSettings: defineTable({
    slotDefaults: v.object({
      threads: v.array(v.string()), // HH:MM, 24h
      instagram: v.array(v.string()),
    }),
    slotDays: v.object({
      threads: v.array(v.number()), // 0-6, Mon = 0
      instagram: v.array(v.number()),
    }),
    timezone: v.string(), // IANA; "auto" until first resolved client-side
    naturalTiming: v.boolean(),
    vacation: v.optional(v.object({ from: v.number(), to: v.number() })),
    rules: v.object({
      mixPillars: v.boolean(),
      evergreenRestDays: v.number(),
      fillGaps: v.union(v.literal("ask"), v.literal("auto"), v.literal("off")),
      oneReelPerDay: v.boolean(),
      pauseOnFailure: v.boolean(),
      dailyCap: v.object({ threads: v.number(), instagram: v.number() }),
    }),
    voice: v.object({
      description: v.string(),
      learnedFromCount: v.number(),
      defaultFrameKey: v.string(),
      defaultPostCount: v.optional(v.number()),
      threadsTopicTag: v.union(v.literal("auto"), v.literal("off")),
      igHashtagMax: v.number(),
      signOff: v.optional(v.string()),
      /** Who the founder is, for the drafting prompt (added 2026-10-06). */
      /** Per-format defaults for Studio: include, story frame, thread length / slide count (added 2026-10-07). */
      formatDefaults: v.optional(
        v.object({
          threads: v.optional(formatDefaultValidator),
          caption: v.optional(formatDefaultValidator),
          reel: v.optional(formatDefaultValidator),
          carousel: v.optional(formatDefaultValidator),
          blog: v.optional(formatDefaultValidator),
        })
      ),
      aboutMe: v.optional(v.string()),
      /** A style guide pasted or loaded from a file, sent with every generation (added 2026-10-06). */
      styleGuide: v.optional(v.string()),
      bannedWords: v.array(v.string()),
    }),
    pillars: v.array(
      v.object({
        key: v.string(),
        name: v.string(),
        color: v.string(),
        description: v.string(),
        targetShare: v.number(),
        links: v.array(v.string()),
      })
    ),
    notifications: v.object({
      tokenExpiring: v.boolean(),
      postFailed: v.boolean(),
      queueLow: v.boolean(),
      postPublished: v.boolean(),
      sundayDigest: v.boolean(),
      quietHours: v.optional(v.string()),
    }),
    media: v.object({
      cleanupAfterDays: v.optional(v.number()),
      igCrop: v.union(v.literal("4:5"), v.literal("1:1")),
    }),
    dismissedNudges: v.array(v.string()), // e.g. "coverage:2026-W40"
  }),

  // Public waitlist (landing site). No auth by design — validation + dedupe
  // only; see Decisions Log for the rate-limiting follow-up.
  waitlist: defineTable({
    email: v.string(), // lowercased + trimmed at write time
    source: v.optional(v.string()), // e.g. "landing"
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  // LEGACY single-operator key/value settings (old slot defaults, publisher pause + heartbeat).
  // New code reads and writes `appSettings`; this table stays until a migration removes it.
  settings: defineTable({
    key: v.string(),
    value: v.string(), // JSON
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
