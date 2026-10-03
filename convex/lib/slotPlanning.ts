import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { readSettings } from "./settingsDb";
import { nextFreeSlot, resolveTz } from "./zoned";

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
  now: number
): Promise<number> {
  const settings = await readSettings(ctx);
  return nextFreeSlot({
    times: settings.slotDefaults[platform],
    days: settings.slotDays[platform],
    tz: resolveTz(settings.timezone === "auto" ? tz : settings.timezone),
    afterMs: now,
    taken,
    maxPerDay: settings.rules.dailyCap[platform],
    vacation: settings.vacation,
  });
}
