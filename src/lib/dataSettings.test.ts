import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, applyPatch } from "../../convex/lib/settingsModel";
import {
  CLEANUP_OFF_LABEL,
  DELETE_WORD,
  STORAGE_LIMIT_BYTES,
  cleanupLabel,
  cleanupOptions,
  cleanupValue,
  confirmTextOk,
  deleteSummary,
  disconnectedText,
  downloadFilename,
  exportBlob,
  formatBytes,
  localDateKey,
  meterPercent,
  storageText,
  withCleanupAfterDays,
} from "./dataSettings";

const accepted = (media: unknown) => {
  const r = applyPatch(DEFAULT_SETTINGS, { media });
  if (!r.ok) throw new Error(r.message);
  return r.settings.media;
};

describe("formatBytes and the meter", () => {
  it("uses KB, MB and GB", () => {
    expect(formatBytes(0)).toBe("0 KB");
    expect(formatBytes(512)).toBe("0.5 KB");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(512 * 1024)).toBe("512 KB");
    expect(formatBytes(3.4 * 1024 * 1024)).toBe("3.4 MB");
    expect(formatBytes(120 * 1024 * 1024)).toBe("120 MB");
    expect(formatBytes(1.2 * 1024 ** 3)).toBe("1.2 GB");
    expect(formatBytes(-5)).toBe("0 KB");
    expect(formatBytes(Number.NaN)).toBe("0 KB");
  });

  it("writes the summary line with a singular file", () => {
    expect(storageText({ files: 3, bytes: 12.4 * 1024 * 1024 })).toBe("3 files, 12 MB used");
    expect(storageText({ files: 1, bytes: 2048 })).toBe("1 file, 2 KB used");
    expect(storageText({ files: 0, bytes: 0 })).toBe("0 files, 0 KB used");
  });

  it("scales the bar to 1 GB, clamped, and never shows used bytes as empty", () => {
    expect(meterPercent(0)).toBe(0);
    expect(meterPercent(STORAGE_LIMIT_BYTES / 4)).toBe(25);
    expect(meterPercent(STORAGE_LIMIT_BYTES * 3)).toBe(100);
    expect(meterPercent(10)).toBe(0.5);
  });
});

describe("tidy up after posting", () => {
  it("offers Off, 7, 14 and 30 days, plus a saved value that is not listed", () => {
    expect(cleanupOptions(undefined).map((o) => o.value)).toEqual(["off", "7", "14", "30"]);
    expect(cleanupOptions(undefined)[0].label).toBe(CLEANUP_OFF_LABEL);
    expect(cleanupLabel(14)).toBe("14 days after the post is published");
    expect(cleanupOptions(21).map((o) => o.value)).toEqual(["off", "7", "14", "21", "30"]);
    expect(cleanupValue(undefined)).toBe("off");
    expect(cleanupValue(7)).toBe("7");
  });

  it("saves the complete media object and keeps igCrop", () => {
    const on = withCleanupAfterDays({ igCrop: "1:1" }, "14");
    expect(on).toEqual({ igCrop: "1:1", cleanupAfterDays: 14 });
    expect(accepted(on)).toEqual({ igCrop: "1:1", cleanupAfterDays: 14 });
  });

  it("Off leaves the optional key out and the backend accepts it", () => {
    const off = withCleanupAfterDays({ igCrop: "4:5", cleanupAfterDays: 7 }, "off");
    expect("cleanupAfterDays" in off).toBe(false);
    expect(off).toEqual({ igCrop: "4:5" });
    expect(accepted(off).cleanupAfterDays).toBeUndefined();
  });

  it("ignores an unreadable value and does not mutate the input", () => {
    const base = Object.freeze({ igCrop: "4:5" as const, cleanupAfterDays: 30 });
    expect(withCleanupAfterDays(base, "soon")).toEqual({ igCrop: "4:5", cleanupAfterDays: 30 });
    expect(withCleanupAfterDays(base, "0")).toEqual({ igCrop: "4:5", cleanupAfterDays: 30 });
  });
});

describe("exports", () => {
  it("builds YYYY-MM-DD from the local date", () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localDateKey(new Date(2026, 10, 30))).toBe("2026-11-30");
  });

  it("uses the server's filename, else a dated fallback", () => {
    expect(downloadFilename("posts-2026-10-05.csv", "csv", "2026-10-05")).toBe("posts-2026-10-05.csv");
    expect(downloadFilename("", "csv", "2026-10-05")).toBe("solo-queue-posts-2026-10-05.csv");
    expect(downloadFilename(undefined, "json", "2026-10-05")).toBe("solo-queue-export-2026-10-05.json");
  });

  it("makes a typed blob; a CSV gets one byte-order mark, JSON none", async () => {
    const csv = exportBlob("a,b\n1,2", "csv");
    expect(csv.type).toContain("text/csv");
    const bytes = new Uint8Array(await csv.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3))).toBe("a,b\n1,2");
    const again = new Uint8Array(await exportBlob("﻿a,b", "csv").arrayBuffer());
    expect([...again.slice(0, 4)]).toEqual([0xef, 0xbb, 0xbf, 0x61]);
    const json = exportBlob("{}", "json");
    expect(json.type).toContain("application/json");
    expect(await json.text()).toBe("{}");
  });
});

describe("disconnect and delete", () => {
  it("enables the delete button only for exactly DELETE", () => {
    expect(DELETE_WORD).toBe("DELETE");
    expect(confirmTextOk("DELETE")).toBe(true);
    for (const t of ["", "delete", "Delete", "DELETE ", " DELETE", "DELET", "DELETEE"]) {
      expect(confirmTextOk(t)).toBe(false);
    }
  });

  it("says how many accounts were disconnected", () => {
    expect(disconnectedText(2)).toBe("Disconnected 2 accounts.");
    expect(disconnectedText(1)).toBe("Disconnected 1 account.");
    expect(disconnectedText(0)).toBe("No accounts were connected.");
  });

  it("summarises the deleted counts in words and skips empty tables", () => {
    expect(deleteSummary({ topics: 4, drafts: 12, assets: 3, frames: 0 })).toBe(
      "Deleted 4 topics, 12 drafts and 3 media files."
    );
    expect(deleteSummary({ topics: 1 })).toBe("Deleted 1 topic.");
    expect(deleteSummary({ topics: 0 })).toMatch(/Nothing was deleted/);
    expect(deleteSummary({})).toMatch(/Nothing was deleted/);
  });
});
