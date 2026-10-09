import type { AppSettings } from "../../convex/lib/settingsModel";

/**
 * Pure helpers for the Media hosting and Data & account Settings sections:
 * byte formatting and the storage meter, the "tidy up" choices and the
 * complete `media` object they save, export download names and blobs, and the
 * typed-word check and summaries for the destructive actions. No React, no
 * Convex calls.
 */

export type Media = AppSettings["media"];

/* ---------- storage meter ---------- */

/** The free plan's hosted-file allowance the meter is scaled to (1 GB). */
export const STORAGE_LIMIT_BYTES = 1024 * 1024 * 1024;
export const STORAGE_LIMIT_LABEL = "of 1 GB on the free plan";

/** "512 KB", "3.4 MB", "1.2 GB". Always KB or larger; 0 is "0 KB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const text = value < 10 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value));
  return `${text} ${units[unit]}`;
}

/** "3 files, 12 MB used" (a single file reads "1 file"). */
export function storageText(summary: { files: number; bytes: number }): string {
  const files = `${summary.files} ${summary.files === 1 ? "file" : "files"}`;
  return `${files}, ${formatBytes(summary.bytes)} used`;
}

/** Share of the 1 GB meter that is filled, 0 to 100 (a used byte never shows an empty bar). */
export function meterPercent(bytes: number, limit: number = STORAGE_LIMIT_BYTES): number {
  if (!Number.isFinite(bytes) || bytes <= 0 || limit <= 0) return 0;
  const pct = (bytes / limit) * 100;
  return Math.min(100, Math.max(0.5, Math.round(pct * 10) / 10));
}

/* ---------- tidy up after posting ---------- */

export const CLEANUP_CHOICES: readonly number[] = [7, 14, 30];
export const CLEANUP_OFF_LABEL = "Off (keep files)";
export const CLEANUP_HELP =
  "Deletes the hosted file once every post that uses it has been published for this long. The post itself and its history stay.";

/** The select's value for a saved number of days ("off" when unset). */
export function cleanupValue(days: number | undefined): string {
  return days === undefined ? "off" : String(days);
}

export function cleanupLabel(days: number | undefined): string {
  if (days === undefined) return CLEANUP_OFF_LABEL;
  return `${days} ${days === 1 ? "day" : "days"} after the post is published`;
}

/** Off, the choices, and a saved value that is not one of them (so it never vanishes). */
export function cleanupOptions(saved: number | undefined): Array<{ value: string; label: string }> {
  const days = new Set<number>(CLEANUP_CHOICES);
  if (saved !== undefined) days.add(saved);
  return [
    { value: "off", label: CLEANUP_OFF_LABEL },
    ...[...days].sort((a, b) => a - b).map((d) => ({ value: String(d), label: cleanupLabel(d) })),
  ];
}

/**
 * The COMPLETE `media` object with the tidy-up choice laid over it. "off"
 * leaves the optional key out; `igCrop` keeps its saved value. An unreadable
 * value changes nothing.
 */
export function withCleanupAfterDays(current: Media, value: string): Media {
  const rest: Media = { ...current };
  delete rest.cleanupAfterDays;
  if (value === "off") return rest;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1) return { ...current };
  return { ...rest, cleanupAfterDays: days };
}

/* ---------- exports ---------- */

/** Today as YYYY-MM-DD in the browser's own time zone. */
export function localDateKey(now: Date = new Date()): string {
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type ExportKind = "csv" | "json";

/** The server's filename, or a dated one when it sent none. */
export function downloadFilename(returned: string | undefined, kind: ExportKind, today: string): string {
  const name = returned?.trim();
  if (name) return name;
  return kind === "csv" ? `solo-queue-posts-${today}.csv` : `solo-queue-export-${today}.json`;
}

/** A Blob for the file; a CSV gets a byte-order mark so Excel reads it as UTF-8. */
export function exportBlob(content: string, kind: ExportKind): Blob {
  if (kind === "json") return new Blob([content], { type: "application/json;charset=utf-8" });
  const body = content.startsWith("﻿") ? content : `﻿${content}`;
  return new Blob([body], { type: "text/csv;charset=utf-8" });
}

/** Save a blob through a temporary link. Browser only. */
export function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- disconnect and delete ---------- */

export const DELETE_WORD = "DELETE";

/** The confirm button is enabled only when the typed text is exactly DELETE (case-sensitive, no trimming). */
export function confirmTextOk(text: string): boolean {
  return text === DELETE_WORD;
}

/** "Disconnected 2 accounts." */
export function disconnectedText(removed: number): string {
  if (removed <= 0) return "No accounts were connected.";
  return `Disconnected ${removed} ${removed === 1 ? "account" : "accounts"}.`;
}

const COUNT_LABELS: Record<string, [string, string]> = {
  topics: ["topic", "topics"],
  sources: ["source", "sources"],
  drafts: ["draft", "drafts"],
  slots: ["queue slot", "queue slots"],
  queue: ["queue item", "queue items"],
  assets: ["media file", "media files"],
  media: ["media file", "media files"],
  frames: ["frame", "frames"],
  looks: ["look", "looks"],
  templates: ["template", "templates"],
  connections: ["connection", "connections"],
  settings: ["setting", "settings"],
  appSettings: ["setting", "settings"],
};

function countLabel(key: string, n: number): string {
  const known = COUNT_LABELS[key];
  if (known) return n === 1 ? known[0] : known[1];
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

/** "Deleted 4 topics, 12 drafts and 3 media files." (tables with nothing in them are left out). */
export function deleteSummary(deleted: Record<string, number>): string {
  const parts = Object.entries(deleted)
    .filter(([, n]) => Number.isFinite(n) && n > 0)
    .map(([key, n]) => `${n} ${countLabel(key, n)}`);
  if (parts.length === 0) return "Everything was already empty. Nothing was deleted.";
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Deleted ${list}.`;
}

export const DISCONNECT_CONFIRM_TEXT =
  "This removes the saved sign-ins for Threads and Instagram. Your drafts, queue and media stay. Queued posts will fail until you connect again. You can also revoke access in your Meta account settings.";
export const DELETE_CONFIRM_TEXT =
  "This permanently deletes your topics, sources, drafts, queue, media files, frames, templates, settings and connections. It cannot be undone. Download the export first if you want a copy.";
