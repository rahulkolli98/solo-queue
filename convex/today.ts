import type { QueryCtx } from "./_generated/server";
import { operatorQuery } from "./lib/operator";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { compareTopics } from "./lib/topicOrder";
import { readiness } from "./lib/research";
import { readSettings } from "./lib/settingsDb";
import { META_DAILY_LIMITS } from "./lib/settingsModel";
import { buildRunway, daysUntil, isoWeekKey, shortDayLabel, type RunwayCell } from "./lib/coverage";
import { dayKey, resolveTz, zonedParts } from "./lib/zoned";

const DAY_MS = 86400000;
const RUNWAY_DAYS = 21;
const EXPIRY_WARNING_DAYS = 21;
const QUEUE_LOW_DAYS = 3;
const PLATFORMS = ["threads", "instagram"] as const;
type Platform = (typeof PLATFORMS)[number];

export interface TodayAlert {
  id: string;
  kind: "failed" | "expiring" | "coverage";
  platform: Platform;
  title: string;
  detail: string;
  slotId?: Id<"slots">;
  /** For coverage alerts: the empty posting days (YYYY-MM-DD). */
  days?: string[];
  /** For coverage alerts: the key stored in appSettings.dismissedNudges when dismissed for the week. */
  dismissKey?: string;
}

const PLATFORM_NAME: Record<Platform, string> = { threads: "Threads", instagram: "Instagram" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function whenLabel(ts: number, tz: string): string {
  const p = zonedParts(ts, tz);
  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]}, ${hh}:${mm}`;
}

async function usage24h(ctx: QueryCtx, now: number): Promise<Record<Platform, number>> {
  const counts: Record<Platform, number> = { threads: 0, instagram: 0 };
  const rows = await ctx.db.query("publishReceipts").order("desc").take(500);
  for (const r of rows) {
    if (r.attemptedAt <= now - DAY_MS) continue;
    if (r.outcome !== "success") continue;
    const slot = await ctx.db.get(r.slotId);
    if (slot) counts[slot.platform] += 1;
  }
  return counts;
}

/**
 * Everything the Today board shows, in one reactive query: the up-next post,
 * the 21-day queue runway per platform, the research inbox, the pillar mix of
 * what is queued, Meta connection health and the alerts (failed, expiring,
 * coverage; worst first). `now` is passed in (rounded by the client) because a
 * query must not read the clock; `tz` is the browser zone, used while the
 * saved zone is still "auto".
 */
export const summary = operatorQuery({
  args: { now: v.number(), tz: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = args.now;
    const settings = await readSettings(ctx);
    const tz = resolveTz(settings.timezone === "auto" ? args.tz : settings.timezone);
    const today = dayKey(now, tz);
    const horizonEnd = now + (RUNWAY_DAYS + 1) * DAY_MS;

    // ---- slots per platform -------------------------------------------------
    const written: Record<Platform, Set<string>> = { threads: new Set(), instagram: new Set() };
    const failedDays: Record<Platform, Set<string>> = { threads: new Set(), instagram: new Set() };
    const failedSlots: Doc<"slots">[] = [];
    const scheduled: Doc<"slots">[] = [];
    let everQueued = false;
    for (const platform of PLATFORMS) {
      // The index is ordered by status first, so read each status over the
      // range it needs; one unbounded read would cut off the scheduled rows.
      const byStatus = (status: Doc<"slots">["status"], from: number, to: number, cap: number) =>
        ctx.db
          .query("slots")
          .withIndex("by_platform_status_scheduled", (q) =>
            q.eq("platform", platform).eq("status", status).gte("scheduledAt", from).lt("scheduledAt", to)
          )
          .take(cap);
      const rows = [
        ...(await byStatus("scheduled", 0, Number.MAX_SAFE_INTEGER, 500)),
        ...(await byStatus("failed", now - 14 * DAY_MS, Number.MAX_SAFE_INTEGER, 100)),
        ...(await byStatus("claimed", now - DAY_MS, horizonEnd, 100)),
        ...(await byStatus("published", now - DAY_MS, horizonEnd, 500)),
      ];
      if (rows.length > 0 || (await ctx.db.query("slots").first())) everQueued = true;
      for (const slot of rows) {
        const key = dayKey(slot.scheduledAt, tz);
        if (slot.status === "failed") {
          if (slot.scheduledAt >= now - 14 * DAY_MS) {
            failedSlots.push(slot);
            failedDays[platform].add(key);
          }
        } else if (slot.scheduledAt >= now - DAY_MS && slot.scheduledAt < horizonEnd) {
          written[platform].add(key);
        }
        if (slot.status === "scheduled") scheduled.push(slot);
      }
    }

    // ---- runway --------------------------------------------------------------
    const runway = {} as Record<Platform, { cells: RunwayCell[]; daysAhead: number; posts: number; emptyDays: string[] }>;
    for (const platform of PLATFORMS) {
      const r = buildRunway({
        writtenDays: written[platform],
        failedDays: failedDays[platform],
        postingDays: settings.slotDays[platform],
        tz,
        nowMs: now,
        horizon: RUNWAY_DAYS,
      });
      runway[platform] = {
        cells: r.cells,
        daysAhead: r.daysAhead,
        emptyDays: r.emptyDays,
        posts: scheduled.filter((s) => s.platform === platform).length,
      };
    }

    // ---- up next ---------------------------------------------------------------
    const nextSlot = [...scheduled].sort((a, b) => a.scheduledAt - b.scheduledAt)[0];
    let upNext: null | {
      slotId: Id<"slots">;
      platform: Platform;
      scheduledAt: number;
      time: string;
      body: string;
      topicTitle: string;
    } = null;
    if (nextSlot) {
      const draft = await ctx.db.get(nextSlot.draftId);
      const topic = draft ? await ctx.db.get(draft.topicId) : null;
      const p = zonedParts(nextSlot.scheduledAt, tz);
      upNext = {
        slotId: nextSlot._id,
        platform: nextSlot.platform,
        scheduledAt: nextSlot.scheduledAt,
        time: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
        body: (draft?.body ?? "").split(/^\s*---\s*$/m)[0].trim(),
        topicTitle: topic?.title ?? "",
      };
    }

    // ---- research inbox --------------------------------------------------------
    const inboxRows: Doc<"topics">[] = [];
    for (const status of ["drafting", "ready"] as const) {
      const rows = await ctx.db
        .query("topics")
        .withIndex("by_status_created", (q) => q.eq("status", status))
        .take(200);
      inboxRows.push(...rows.filter((t) => t.archivedAt === undefined));
    }
    inboxRows.sort(compareTopics);
    const pillarByKey = new Map(settings.pillars.map((p) => [p.key, p]));
    const top = await Promise.all(
      inboxRows.slice(0, 3).map(async (t) => {
        const sources = await ctx.db
          .query("sources")
          .withIndex("by_topic_and_createdAt", (q) => q.eq("topicId", t._id))
          .take(50);
        const pillar = pillarByKey.get(t.pillar ?? "build");
        const r = readiness({ sourceCount: sources.length, hasNotes: Boolean(t.notes), hasBrief: Boolean(t.brief) });
        return {
          id: t._id,
          title: t.title,
          pillarName: pillar?.name ?? "Build in public",
          pillarColor: pillar?.color ?? "pillar-build",
          sourceCount: sources.length,
          ready: r.ready,
        };
      })
    );

    // ---- pillar mix of what is queued -----------------------------------------
    const counts = new Map<string, number>();
    for (const slot of scheduled) {
      const draft = await ctx.db.get(slot.draftId);
      const topic = draft ? await ctx.db.get(draft.topicId) : null;
      const key = pillarByKey.has(topic?.pillar ?? "") ? (topic?.pillar as string) : "build";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const queuedTotal = scheduled.length;
    const pillarMix = settings.pillars.map((p) => ({
      key: p.key,
      name: p.name,
      color: p.color,
      target: p.targetShare,
      count: counts.get(p.key) ?? 0,
      actual: queuedTotal ? Math.round(((counts.get(p.key) ?? 0) / queuedTotal) * 100) : 0,
    }));

    // ---- Meta connections ------------------------------------------------------
    const connections = await ctx.db.query("connections").take(10);
    const used = await usage24h(ctx, now);
    const meta = {
      connections: PLATFORMS.map((platform) => {
        const c = connections.find((row) => row.platform === platform);
        return c
          ? {
              platform,
              connected: true as const,
              handle: c.handle,
              status: c.status,
              tokenExpiresAt: c.tokenExpiresAt,
              tokenDaysLeft: daysUntil(c.tokenExpiresAt, now),
              used24h: used[platform],
              limit: META_DAILY_LIMITS[platform],
            }
          : { platform, connected: false as const };
      }),
      feesThisMonth: 0,
    };

    // ---- alerts: failed -> expiring -> coverage --------------------------------
    const alerts: TodayAlert[] = [];
    if (settings.notifications.postFailed) {
      for (const slot of failedSlots.sort((a, b) => a.scheduledAt - b.scheduledAt).slice(0, 3)) {
        alerts.push({
          id: `failed:${slot._id}`,
          kind: "failed",
          platform: slot.platform,
          slotId: slot._id,
          title: `${PLATFORM_NAME[slot.platform]} post failed · ${whenLabel(slot.scheduledAt, tz)}.`,
          detail: slot.lastError ?? "The publisher gave up on this post.",
        });
      }
    }
    if (settings.notifications.tokenExpiring) {
      for (const c of connections) {
        const left = daysUntil(c.tokenExpiresAt, now);
        if (c.status === "failed") {
          alerts.push({
            id: `expiring:${c.platform}`,
            kind: "expiring",
            platform: c.platform,
            title: `${PLATFORM_NAME[c.platform]} connection needs attention.`,
            detail: c.lastError ?? "The last token refresh failed. Reconnect before posts fail.",
          });
        } else if (left <= EXPIRY_WARNING_DAYS) {
          alerts.push({
            id: `expiring:${c.platform}`,
            kind: "expiring",
            platform: c.platform,
            title: `${PLATFORM_NAME[c.platform]} token expires in ${left} day${left === 1 ? "" : "s"}.`,
            detail: "Reconnect before the slots start failing.",
          });
        }
      }
    }
    if (settings.notifications.queueLow) {
      const week = isoWeekKey(now, tz);
      for (const platform of PLATFORMS) {
        if (settings.slotDays[platform].length === 0) continue;
        if (!connections.some((c) => c.platform === platform)) continue;
        const days = runway[platform].daysAhead;
        if (days >= QUEUE_LOW_DAYS) continue;
        const dismissKey = `coverage:${platform}:${week}`;
        if (settings.dismissedNudges.includes(dismissKey)) continue;
        const empty = runway[platform].emptyDays.slice(0, 3);
        alerts.push({
          id: `coverage:${platform}`,
          kind: "coverage",
          platform,
          title: `${PLATFORM_NAME[platform]} has ${days} day${days === 1 ? "" : "s"} written.`,
          detail: empty.length ? `Empty: ${empty.map(shortDayLabel).join(", ")}.` : "Nothing is queued.",
          days: empty,
          dismissKey,
        });
      }
    }

    // ---- first run ---------------------------------------------------------------
    const steps = {
      threadsConnected: connections.some((c) => c.platform === "threads"),
      hasTopic: inboxRows.length > 0 || everQueued,
      queuedWeek: scheduled.length > 0,
    };

    return {
      tz,
      today,
      firstRun: !everQueued,
      steps,
      upNext,
      runway,
      inbox: { count: inboxRows.length, top },
      pillarMix,
      meta,
      alerts,
    };
  },
});
