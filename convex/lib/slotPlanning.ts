import type { MutationCtx } from "../_generated/server";
import { readSettings } from "./settingsDb";
import { nextFreeSlot, resolveTz } from "./zoned";

/** Scheduled slot times for a platform (the founder's queue), bounded. */
export async function takenTimes(
  ctx: MutationCtx,
  platform: "threads" | "instagram"
): Promise<number[]> {
  const rows = await ctx.db
    .query("slots")
    .withIndex("by_platform_status_scheduled", (q) =>
      q.eq("platform", platform).eq("status", "scheduled")
    )
    .take(500);
  return rows.map((r) => r.scheduledAt);
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
