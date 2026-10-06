import { v } from "convex/values";
import { operatorMutation, operatorQuery } from "./lib/operator";
import { refusal } from "./lib/slots";
import { readSettings, stripSystemFields } from "./lib/settingsDb";
import { DEFAULT_SETTINGS, applyPatch, type AppSettings } from "./lib/settingsModel";
import { moveQueueAfterVacation } from "./lib/vacationShift";

/**
 * The typed settings singleton (`appSettings`). The old key/value `settings`
 * table is legacy: nothing here reads or writes it.
 */
export const get = operatorQuery({
  args: {},
  handler: async (ctx): Promise<AppSettings> => readSettings(ctx),
});

/**
 * Update one or more sections. `patch` is a partial object keyed by top-level
 * section ("slotDefaults", "rules", ...); each touched section is validated
 * and replaced whole. Invalid input is refused with the section named.
 *
 * Saving a vacation window also moves the posts due inside it to the first
 * free slots after it (same transaction; see lib/vacationShift). `tz` is the
 * browser zone, used for that planning while the saved zone is still "auto".
 */
export const update = operatorMutation({
  args: { patch: v.any(), tz: v.optional(v.string()) },
  handler: async (ctx, args): Promise<AppSettings> => {
    const row = await ctx.db.query("appSettings").first();
    const current = row ? { ...DEFAULT_SETTINGS, ...stripSystemFields(row) } : DEFAULT_SETTINGS;
    const result = applyPatch(current, args.patch);
    if (!result.ok) {
      throw refusal("INVALID_SETTINGS", `${result.section}: ${result.message}`);
    }
    if (row) await ctx.db.replace(row._id, result.settings);
    else await ctx.db.insert("appSettings", result.settings);
    const touchedVacation = Object.prototype.hasOwnProperty.call(args.patch, "vacation");
    if (touchedVacation && result.settings.vacation) {
      await moveQueueAfterVacation(ctx, result.settings, args.tz, Date.now());
    }
    return result.settings;
  },
});
