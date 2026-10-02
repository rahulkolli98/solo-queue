import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { refusal } from "./lib/slots";
import { readSettings, stripSystemFields } from "./lib/settingsDb";
import { DEFAULT_SETTINGS, applyPatch, type AppSettings } from "./lib/settingsModel";

/**
 * The typed settings singleton (`appSettings`). The legacy slot-default
 * functions further down read the old key/value table and are replaced when
 * the Settings screens are rebuilt.
 */
export const get = query({
  args: {},
  handler: async (ctx): Promise<AppSettings> => readSettings(ctx),
});

/**
 * Update one or more sections. `patch` is a partial object keyed by top-level
 * section ("slotDefaults", "rules", ...); each touched section is validated
 * and replaced whole. Invalid input is refused with the section named.
 */
export const update = mutation({
  args: { patch: v.any() },
  handler: async (ctx, args): Promise<AppSettings> => {
    const row = await ctx.db.query("appSettings").first();
    const current = row ? { ...DEFAULT_SETTINGS, ...stripSystemFields(row) } : DEFAULT_SETTINGS;
    const result = applyPatch(current, args.patch);
    if (!result.ok) {
      throw refusal("INVALID_SETTINGS", `${result.section}: ${result.message}`);
    }
    if (row) await ctx.db.replace(row._id, result.settings);
    else await ctx.db.insert("appSettings", result.settings);
    return result.settings;
  },
});

// ----- legacy key/value slot defaults (old single-time UI) -----

export interface SlotDefaults {
  threads: string;
  instagram: string;
}

const FALLBACK: SlotDefaults = { threads: "09:00", instagram: "18:00" };
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parse(raw: string | undefined): SlotDefaults {
  if (!raw) return FALLBACK;
  try {
    const v = JSON.parse(raw) as Partial<SlotDefaults>;
    return {
      threads: typeof v.threads === "string" ? v.threads : FALLBACK.threads,
      instagram:
        typeof v.instagram === "string" ? v.instagram : FALLBACK.instagram,
    };
  } catch {
    return FALLBACK;
  }
}

/** Founder-set default post times per platform (OQ-004). */
export const getSlotDefaults = query({
  args: {},
  handler: async (ctx): Promise<SlotDefaults> => {
    const row = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "slotDefaults"))
      .unique();
    return parse(row?.value);
  },
});

export const setSlotDefaults = mutation({
  args: { threads: v.string(), instagram: v.string() },
  handler: async (ctx, args): Promise<SlotDefaults> => {
    if (!TIME_RE.test(args.threads) || !TIME_RE.test(args.instagram)) {
      throw new Error("Times must be HH:MM (24-hour).");
    }
    const value = JSON.stringify({
      threads: args.threads,
      instagram: args.instagram,
    });
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", "slotDefaults"))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", {
        key: "slotDefaults",
        value,
        updatedAt: Date.now(),
      });
    }
    return { threads: args.threads, instagram: args.instagram };
  },
});
