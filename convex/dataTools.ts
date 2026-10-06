import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { operatorAction, operatorMutation, operatorQuery } from "./lib/operator";
import { stripSystemFields } from "./lib/settingsDb";

/**
 * Data and account tools (Settings > Data & account): exports, disconnect and
 * "delete everything". Every public function here is operator-guarded.
 */

/**
 * Tables `deleteEverything` wipes (the founder's data). Order matters only for
 * readability: children first, then parents.
 */
export const WIPE_TABLES = [
  "publishReceipts",
  "slots",
  "drafts",
  "sources",
  "mediaAssets",
  "topics",
  "frames",
  "templates",
  "appSettings",
  "settings",
  "connections",
] as const;

/** Tables `deleteEverything` deliberately leaves alone (not the founder's data). */
export const KEEP_TABLES = ["waitlist"] as const;

type WipeTable = (typeof WIPE_TABLES)[number];

function isWipeTable(name: string): name is WipeTable {
  return (WIPE_TABLES as readonly string[]).includes(name);
}

// ---------------------------------------------------------------- CSV export

/** Escape one CSV cell: neutralise spreadsheet formulas, then quote when needed. */
export function csvCell(value: string): string {
  // A cell starting with = + - @ (or a tab / CR) is read as a formula by Excel and Sheets.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const CSV_COLUMNS = [
  "platform",
  "status",
  "scheduled_at_iso",
  "published_at_iso",
  "topic",
  "pillar",
  "format",
  "text",
  "permalink_or_post_id",
  "last_error",
] as const;

const EXPORT_CAP = 1000; // rows per table (a query reads a bounded amount); `truncated` reports a hit
const CSV_SLOT_CAP = 2000;

function iso(ms: number | undefined): string {
  return ms === undefined || !Number.isFinite(ms) ? "" : new Date(ms).toISOString();
}

/** `YYYY-MM-DD` passed in by the caller (a query must not read the clock), else no date in the name. */
function datePart(today: string | undefined): string {
  return today && /^\d{4}-\d{2}-\d{2}$/.test(today) ? `-${today}` : "";
}

/**
 * Every queued or published post as a spreadsheet-ready CSV, oldest scheduled
 * time first. The content starts with a UTF-8 byte-order mark so Excel reads
 * accents and emoji correctly: download it as-is, do not add another.
 */
export const exportPostsCsv = operatorQuery({
  args: { today: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ filename: string; content: string; rows: number; truncated: boolean }> => {
    const newest = await ctx.db.query("slots").order("desc").take(CSV_SLOT_CAP + 1);
    const truncated = newest.length > CSV_SLOT_CAP;
    const slots = newest.slice(0, CSV_SLOT_CAP).sort((a, b) => a.scheduledAt - b.scheduledAt);

    const topics = new Map<Id<"topics">, Doc<"topics"> | null>();
    const lines = [CSV_COLUMNS.join(",")];
    for (const slot of slots) {
      const draft = await ctx.db.get(slot.draftId);
      let topic: Doc<"topics"> | null = null;
      if (draft) {
        if (!topics.has(draft.topicId)) topics.set(draft.topicId, await ctx.db.get(draft.topicId));
        topic = topics.get(draft.topicId) ?? null;
      }
      const cells = [
        slot.platform,
        slot.status,
        iso(slot.scheduledAt),
        iso(slot.publishedAt),
        topic?.title ?? "",
        topic?.pillar ?? "",
        draft?.format ?? "",
        draft?.body ?? "",
        slot.publishedPlatformId ?? "",
        slot.lastError ?? "",
      ];
      lines.push(cells.map(csvCell).join(","));
    }
    return {
      filename: `solo-queue-posts${datePart(args.today)}.csv`,
      content: `﻿${lines.join("\r\n")}\r\n`,
      rows: slots.length,
      truncated,
    };
  },
});

// --------------------------------------------------------------- JSON export

/** Strip anything that looks like a credential from free text (provider messages can echo URLs). */
function scrubText(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret.length >= 8) out = out.split(secret).join("[redacted]");
  }
  return out
    .replace(/((?:access_token|refresh_token|client_secret)=)[^&\s"']+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{12,}/g, "$1[redacted]");
}

/**
 * All of the founder's content as pretty JSON. Never includes `connections`
 * (tokens), file bytes or signed file URLs. As defence in depth, any live
 * connection token and any `access_token=...` style text is redacted from the
 * output even if a provider message echoed it.
 */
export const exportAllJson = operatorQuery({
  args: { today: v.optional(v.string()) },
  handler: async (
    ctx,
    args
  ): Promise<{ filename: string; content: string; counts: Record<string, number>; truncated: string[] }> => {
    const truncated: string[] = [];
    const counts: Record<string, number> = {};
    const tables: Record<string, unknown[]> = {};
    const keep = <T>(name: string, rows: T[]): T[] => {
      const cut = rows.length > EXPORT_CAP;
      if (cut) truncated.push(name);
      const out = cut ? rows.slice(0, EXPORT_CAP) : rows;
      counts[name] = out.length;
      tables[name] = out;
      return out;
    };

    keep("topics", await ctx.db.query("topics").take(EXPORT_CAP + 1));
    keep("sources", await ctx.db.query("sources").take(EXPORT_CAP + 1));
    keep("drafts", await ctx.db.query("drafts").take(EXPORT_CAP + 1));
    keep("slots", await ctx.db.query("slots").take(EXPORT_CAP + 1));
    keep("frames", await ctx.db.query("frames").take(EXPORT_CAP + 1));
    keep("templates", await ctx.db.query("templates").take(EXPORT_CAP + 1));
    keep("publishReceipts", await ctx.db.query("publishReceipts").take(EXPORT_CAP + 1));
    keep(
      "appSettings",
      (await ctx.db.query("appSettings").take(EXPORT_CAP + 1)).map((row) => stripSystemFields(row))
    );

    const assets = await ctx.db.query("mediaAssets").take(EXPORT_CAP + 1);
    const mediaRows = [];
    for (const asset of assets.slice(0, EXPORT_CAP)) {
      const external = asset.storageId.startsWith("external:");
      const meta =
        external || asset.fileDeletedAt !== undefined
          ? null
          : await ctx.db.system.get("_storage", asset.storageId as Id<"_storage">);
      mediaRows.push({
        _id: asset._id,
        filename: asset.filename ?? null,
        mimeType: asset.mimeType,
        source: asset.source ?? (external ? "external" : "upload"),
        // Only the founder's own external link; hosted files get no URL (it is a live link to the file).
        url: external ? asset.publicUrl : null,
        sizeBytes: meta?.size ?? null,
        verifiedAt: asset.verifiedAt ?? null,
        fileDeletedAt: asset.fileDeletedAt ?? null,
        createdAt: asset.createdAt,
      });
    }
    if (assets.length > EXPORT_CAP) truncated.push("mediaAssets");
    counts.mediaAssets = mediaRows.length;
    tables.mediaAssets = mediaRows;

    // Read tokens only to redact them from the output; they are never copied into it.
    const secrets: string[] = [];
    for (const conn of await ctx.db.query("connections").take(20)) {
      secrets.push(conn.accessToken);
    }

    const json = JSON.stringify(
      { app: "solo-queue", format: 1, exportedOn: args.today ?? null, counts, ...tables },
      null,
      2
    );
    // Redact on the serialized text, covering both the raw and the JSON-escaped form of each token.
    const escaped = secrets.map((s) => JSON.stringify(s).slice(1, -1));
    return {
      filename: `solo-queue-export${datePart(args.today)}.json`,
      content: scrubText(json, [...secrets, ...escaped]),
      counts,
      truncated,
    };
  },
});

// ------------------------------------------------------------ account tools

/** Delete every platform connection (the tokens). Drafts, queue, topics and media are untouched. */
export const disconnectAll = operatorMutation({
  args: {},
  handler: async (ctx): Promise<{ removed: number }> => {
    const rows = await ctx.db.query("connections").take(100);
    for (const row of rows) await ctx.db.delete(row._id);
    return { removed: rows.length };
  },
});

const MAX_BATCH = 500;
const DEFAULT_BATCH = 200;

/**
 * Delete up to `batchSize` rows of one allow-listed table. For mediaAssets the
 * stored file goes first, then the row. Internal: only `deleteEverything` calls it.
 */
export const deleteBatch = internalMutation({
  args: { table: v.string(), batchSize: v.number() },
  handler: async (ctx, args): Promise<{ deleted: number; more: boolean }> => {
    if (!isWipeTable(args.table)) {
      throw new ConvexError(`VALIDATION:NOT_WIPEABLE: "${args.table}" is not a table that can be wiped.`);
    }
    const size = Math.min(MAX_BATCH, Math.max(1, Math.floor(args.batchSize)));
    // One page beyond the batch tells us whether more remain.
    if (args.table === "mediaAssets") {
      const rows = await ctx.db.query("mediaAssets").take(size + 1);
      for (const row of rows.slice(0, size)) {
        if (row.fileDeletedAt === undefined && !row.storageId.startsWith("external:")) {
          try {
            await ctx.storage.delete(row.storageId as Id<"_storage">);
          } catch {
            // File already gone: still drop the row.
          }
        }
        await ctx.db.delete(row._id);
      }
      return { deleted: Math.min(rows.length, size), more: rows.length > size };
    }
    // The table name was checked against the allow-list above; the cast only satisfies the types.
    const table = args.table as "topics";
    const rows = await ctx.db.query(table).take(size + 1);
    for (const row of rows.slice(0, size)) await ctx.db.delete(row._id);
    return { deleted: Math.min(rows.length, size), more: rows.length > size };
  },
});

/**
 * Wipe the founder's data: every WIPE_TABLES table, hosted files included.
 * Leaves the public waitlist. Irreversible, so the caller must type DELETE.
 * `batchSize` exists so tests can exercise many batches with few rows.
 */
export const deleteEverything = operatorAction({
  args: { confirm: v.string(), batchSize: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ deleted: Record<string, number> }> => {
    if (args.confirm !== "DELETE") {
      throw new ConvexError("VALIDATION:CONFIRM: Type DELETE to confirm.");
    }
    const batchSize = args.batchSize ?? DEFAULT_BATCH;
    const deleted: Record<string, number> = {};
    for (const table of WIPE_TABLES) {
      deleted[table] = 0;
      // Bounded loop: 10,000 batches is far past any real table; it stops a runaway rather than spin.
      for (let i = 0; i < 10_000; i++) {
        const out: { deleted: number; more: boolean } = await ctx.runMutation(internal.dataTools.deleteBatch, {
          table,
          batchSize,
        });
        deleted[table] += out.deleted;
        if (!out.more) break;
      }
    }
    return { deleted };
  },
});
