import type { QueryCtx } from "../_generated/server";
import { FAILURE_WINDOW_MS, holdReason, type HoldReason } from "./queueHold";
import { readSettings } from "./settingsDb";
import type { AppSettings } from "./settingsModel";

/**
 * Why the publisher is holding right now, read from the database. Used inside
 * `slots.claimDue` (so the check and the claim are one transaction), by the
 * tick's dry run and logs, and by the shell's publisher status.
 */
export async function readHold(
  ctx: QueryCtx,
  now: number,
  settings?: AppSettings
): Promise<{ reason: HoldReason; vacationUntil: number | null; settings: AppSettings }> {
  const s = settings ?? (await readSettings(ctx));
  const failed = [];
  if (s.rules.pauseOnFailure) {
    for (const platform of ["threads", "instagram"] as const) {
      const row = await ctx.db
        .query("slots")
        .withIndex("by_platform_status_scheduled", (q) =>
          q.eq("platform", platform).eq("status", "failed").gte("scheduledAt", now - FAILURE_WINDOW_MS)
        )
        .first();
      if (row) failed.push(row);
    }
  }
  const reason = holdReason(s, failed, now);
  return { reason, vacationUntil: reason === "vacation" ? (s.vacation?.to ?? null) : null, settings: s };
}
