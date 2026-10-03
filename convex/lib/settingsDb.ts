import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { DEFAULT_SETTINGS, type AppSettings } from "./settingsModel";

/** The stored row without Convex system fields. */
export function stripSystemFields(row: Doc<"appSettings">): AppSettings {
  const { _id, _creationTime, ...rest } = row;
  void _id;
  void _creationTime;
  return rest as AppSettings;
}

/**
 * Current settings: the stored singleton laid over the defaults, so a field
 * added later still has a value for rows written before it existed. Falls
 * back to the defaults when nothing is stored yet (a query cannot insert).
 */
export async function readSettings(ctx: QueryCtx): Promise<AppSettings> {
  const row = await ctx.db.query("appSettings").first();
  if (!row) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...stripSystemFields(row) };
}
