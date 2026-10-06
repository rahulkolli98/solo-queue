import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { isReelTemplate } from "./queueRules";
import type { AppSettings } from "./settingsModel";
import { effectiveTz, planSlot, reelDays, takenTimes } from "./slotPlanning";
import { dayKey } from "./zoned";

/**
 * Saving a vacation window moves the posts that were due inside it to the
 * first free slots after it, keeping their order (per platform) and planning
 * with the same days, times, daily cap and time zone as any new post. Runs in
 * the same transaction as the settings write, so a failure rolls both back.
 *
 * A post that cannot be placed (nothing fits in the planning horizon) stays
 * where it is; the save never fails because of it. `originalScheduledAt`
 * keeps the time the founder first chose. Clearing a vacation moves nothing back.
 */
export async function moveQueueAfterVacation(
  ctx: MutationCtx,
  settings: AppSettings,
  browserTz: string | undefined,
  now: number
): Promise<{ moved: number; stayed: number }> {
  const vacation = settings.vacation;
  let moved = 0;
  let stayed = 0;
  if (!vacation) return { moved, stayed };
  const tz = effectiveTz(settings, browserTz);

  for (const platform of ["threads", "instagram"] as const) {
    // The index is ordered by scheduledAt, so this is the queue's own order.
    const inWindow = await ctx.db
      .query("slots")
      .withIndex("by_platform_status_scheduled", (q) =>
        q
          .eq("platform", platform)
          .eq("status", "scheduled")
          .gte("scheduledAt", vacation.from)
          .lte("scheduledAt", vacation.to)
      )
      .take(1000);
    if (inWindow.length === 0) continue;

    // The posts that are moving free their old times and days.
    const taken = await takenTimes(ctx, platform);
    for (const slot of inWindow) {
      const i = taken.indexOf(slot.scheduledAt);
      if (i >= 0) taken.splice(i, 1);
    }

    const keepOneReel = settings.rules.oneReelPerDay && platform === "instagram";
    const reelDaysTaken = keepOneReel
      ? await reelDays(ctx, tz, now, new Set<Id<"slots">>(inWindow.map((s) => s._id)))
      : new Set<string>();

    // Strictly after the end of the window, and after the previous moved post, so order holds.
    let after = Math.max(vacation.to, now);
    for (const slot of inWindow) {
      const draft = keepOneReel ? await ctx.db.get(slot.draftId) : null;
      const isReel = draft !== null && isReelTemplate(draft.templateKey);
      let at: number;
      try {
        at = planSlot(settings, platform, taken, tz, after, {
          rejectDays: isReel ? reelDaysTaken : undefined,
        });
      } catch {
        stayed += 1;
        continue;
      }
      await ctx.db.patch(slot._id, {
        scheduledAt: at,
        originalScheduledAt: slot.originalScheduledAt ?? slot.scheduledAt,
      });
      taken.push(at);
      after = at;
      if (isReel) reelDaysTaken.add(dayKey(at, tz));
      moved += 1;
    }
  }
  return { moved, stayed };
}
