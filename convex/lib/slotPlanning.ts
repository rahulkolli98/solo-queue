import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { clashesWithNeighbour, isReelTemplate, pillarOf, type QueuedPillar } from "./queueRules";
import { readSettings } from "./settingsDb";
import type { AppSettings } from "./settingsModel";
import { refusal } from "./slots";
import { dayKey, nextFreeSlot, resolveTz } from "./zoned";

/**
 * Slot times that already use up room on a platform, bounded: the scheduled
 * queue, plus posts from the last two days that were claimed or published, so
 * a day's cap counts what already went out today.
 */
export async function takenTimes(
  ctx: MutationCtx,
  platform: "threads" | "instagram"
): Promise<number[]> {
  const recent = Date.now() - 2 * 86400000;
  const times: number[] = [];
  const scheduled = await ctx.db
    .query("slots")
    .withIndex("by_platform_status_scheduled", (q) =>
      q.eq("platform", platform).eq("status", "scheduled")
    )
    .take(500);
  times.push(...scheduled.map((r) => r.scheduledAt));
  for (const status of ["claimed", "published"] as const) {
    const rows = await ctx.db
      .query("slots")
      .withIndex("by_platform_status_scheduled", (q) =>
        q.eq("platform", platform).eq("status", status).gte("scheduledAt", recent)
      )
      .take(50);
    times.push(...rows.map((r) => r.scheduledAt));
  }
  return times;
}

/** True when the draft already has a post waiting or in flight (scheduled or claimed). */
export async function hasOpenSlot(
  ctx: MutationCtx,
  draftId: Id<"drafts">
): Promise<boolean> {
  const slots = await ctx.db
    .query("slots")
    .withIndex("by_draft", (q) => q.eq("draftId", draftId))
    .take(100);
  return slots.some((s) => s.status === "scheduled" || s.status === "claimed");
}

/** The time zone slots are planned in: the saved zone, or the browser's while the saved zone is still "auto". */
export function effectiveTz(settings: AppSettings, browserTz: string | undefined): string {
  return resolveTz(settings.timezone === "auto" ? browserTz : settings.timezone);
}

export interface PlanOptions {
  /** Local days (YYYY-MM-DD in the planning zone) that must not be used, for example days that already hold a reel. */
  rejectDays?: ReadonlySet<string>;
  /** Skip slots next to a scheduled post of this pillar ("mix pillars"); `queue` is the platform's scheduled posts. */
  mix?: { pillar: string; queue: QueuedPillar[] };
}

/**
 * The next free slot after `afterMs`, planned from the given settings: the
 * founder's times and posting days in `tz` (already resolved), skipping taken
 * slots, days that already hold their own daily cap, the vacation window and
 * whatever `opts` vetoes. Throws when nothing fits in the horizon.
 */
export function planSlot(
  settings: AppSettings,
  platform: "threads" | "instagram",
  taken: number[],
  tz: string,
  afterMs: number,
  opts: PlanOptions = {}
): number {
  const { rejectDays, mix } = opts;
  return nextFreeSlot({
    times: settings.slotDefaults[platform],
    days: settings.slotDays[platform],
    tz,
    afterMs,
    taken,
    maxPerDay: settings.rules.dailyCap[platform],
    vacation: settings.vacation,
    reject:
      rejectDays || mix
        ? (ts) =>
            (rejectDays?.has(dayKey(ts, tz)) ?? false) ||
            (mix !== undefined && clashesWithNeighbour(mix.queue, ts, mix.pillar))
        : undefined,
  });
}

/**
 * The next free slot for a platform from the typed settings: the founder's
 * times and posting days in their time zone, skipping taken slots, days that
 * already hold their own daily cap, and the vacation window. `tz` is the
 * browser zone, used while the saved zone is still "auto".
 */
export async function planNextSlot(
  ctx: MutationCtx,
  platform: "threads" | "instagram",
  taken: number[],
  tz: string | undefined,
  now: number,
  opts: PlanOptions = {}
): Promise<number> {
  const settings = await readSettings(ctx);
  return planSlot(settings, platform, taken, effectiveTz(settings, tz), now, opts);
}

/**
 * Local days (in `tz`) that already hold a reel: scheduled, claimed or
 * recently published Instagram posts whose draft is a reel. `exclude` leaves
 * out slots that are about to move.
 */
export async function reelDays(
  ctx: QueryCtx,
  tz: string,
  now: number,
  exclude?: ReadonlySet<Id<"slots">>
): Promise<Set<string>> {
  const days = new Set<string>();
  const recent = now - 2 * 86400000;
  for (const status of ["scheduled", "claimed", "published"] as const) {
    const rows = await ctx.db
      .query("slots")
      .withIndex("by_platform_status_scheduled", (q) =>
        status === "scheduled"
          ? q.eq("platform", "instagram").eq("status", status)
          : q.eq("platform", "instagram").eq("status", status).gte("scheduledAt", recent)
      )
      .take(500);
    for (const row of rows) {
      if (exclude?.has(row._id)) continue;
      const draft = await ctx.db.get(row.draftId);
      if (draft && isReelTemplate(draft.templateKey)) days.add(dayKey(row.scheduledAt, tz));
    }
  }
  return days;
}

/** The platform's scheduled posts with the pillar of each one's topic, for the "mix pillars" check. */
export async function scheduledPillars(
  ctx: QueryCtx,
  platform: "threads" | "instagram"
): Promise<QueuedPillar[]> {
  const rows = await ctx.db
    .query("slots")
    .withIndex("by_platform_status_scheduled", (q) => q.eq("platform", platform).eq("status", "scheduled"))
    .take(500);
  const out: QueuedPillar[] = [];
  for (const row of rows) {
    const draft = await ctx.db.get(row.draftId);
    const topic = draft ? await ctx.db.get(draft.topicId) : null;
    out.push({ at: row.scheduledAt, pillar: pillarOf(topic?.pillar) });
  }
  return out;
}

/** Refuse a second reel on a local day that already has one (when "One reel a day" is on). */
export async function assertOneReelPerDay(
  ctx: QueryCtx,
  settings: AppSettings,
  templateKey: string,
  at: number,
  tz: string | undefined,
  now: number,
  excludeSlot?: Id<"slots">
): Promise<void> {
  if (!settings.rules.oneReelPerDay || !isReelTemplate(templateKey)) return;
  const zone = effectiveTz(settings, tz);
  const days = await reelDays(ctx, zone, now, excludeSlot ? new Set([excludeSlot]) : undefined);
  if (days.has(dayKey(at, zone))) {
    throw refusal(
      "ONE_REEL_PER_DAY",
      'There is already a reel on that day. Pick another day, or turn off "One reel a day" in Settings.'
    );
  }
}

const PLATFORM_NAME = { threads: "Threads", instagram: "Instagram" } as const;

/** Refuse a placement that would put more posts on a local day than the founder's daily cap for the platform. */
export function assertUnderDailyCap(
  settings: AppSettings,
  platform: "threads" | "instagram",
  taken: number[],
  at: number,
  tz: string
): void {
  const cap = settings.rules.dailyCap[platform];
  const key = dayKey(at, tz);
  const used = taken.filter((t) => dayKey(t, tz) === key).length;
  if (used >= cap) {
    throw refusal(
      "DAILY_CAP",
      `${PLATFORM_NAME[platform]} already has ${used} post${used === 1 ? "" : "s"} that day, and your daily cap is ${cap}. Pick another day, or raise the cap in Settings.`
    );
  }
}
