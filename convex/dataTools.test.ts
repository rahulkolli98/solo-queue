import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { DEFAULT_SETTINGS } from "./lib/settingsModel";
import { KEEP_TABLES, WIPE_TABLES, csvCell } from "./dataTools";
import { insertDraft, insertSlot, insertTopic, newAnonymousTest, newTest, type TestConvex } from "../src/test-utils/convex";

const TOKEN = "THREADS-SECRET-TOKEN-abc123XYZ-do-not-leak";

async function addConnection(t: TestConvex, platform: "threads" | "instagram" = "threads") {
  await t.run(async (ctx) => {
    await ctx.db.insert("connections", {
      platform,
      platformUserId: "u1",
      handle: "@founder",
      accessToken: TOKEN,
      tokenExpiresAt: Date.now() + 1e9,
      scopes: ["threads_basic"],
      status: "healthy",
      lastCheckedAt: Date.now(),
    });
  });
}

/** One row in every table, with a stored file behind the hosted media asset. */
async function seedEverything(t: TestConvex) {
  const topic = await insertTopic(t, "Launch notes");
  const draft = await insertDraft(t, topic, "threads", "First post");
  const slot = await insertSlot(t, draft, Date.now() + 1000);
  const storageId = await t.run(async (ctx) => ctx.storage.store(new Blob(["bytes"], { type: "image/png" })));
  await t.run(async (ctx) => {
    await ctx.db.insert("mediaAssets", {
      storageId,
      publicUrl: "https://files.example/signed?token=zzz",
      mimeType: "image/png",
      source: "upload",
      filename: "hero.png",
      createdAt: Date.now(),
    });
    await ctx.db.insert("sources", { topicId: topic, kind: "note", text: "n", label: "note", createdAt: Date.now() });
    await ctx.db.insert("publishReceipts", { slotId: slot, attemptedAt: Date.now(), outcome: "success" });
    await ctx.db.insert("frames", {
      key: "k",
      name: "Frame",
      beats: [],
      fits: ["thread"],
      color: "pillar-build",
      usedCount: 0,
      version: 1,
      isActive: true,
      createdAt: Date.now(),
    });
    await ctx.db.insert("templates", { key: "tk", version: 1, body: "b", isActive: true, createdAt: Date.now() });
    await ctx.db.insert("appSettings", DEFAULT_SETTINGS);
    await ctx.db.insert("settings", { key: "legacy", value: "1", updatedAt: Date.now() });
    await ctx.db.insert("waitlist", { email: "fan@example.com", createdAt: Date.now() });
  });
  await addConnection(t);
  return { storageId };
}

async function tableCount(t: TestConvex, table: (typeof WIPE_TABLES)[number] | "waitlist"): Promise<number> {
  return await t.run(async (ctx) => (await ctx.db.query(table).collect()).length);
}

describe("csvCell", () => {
  it("quotes commas, quotes and newlines, and neutralises formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("=1,2")).toBe(`"'=1,2"`);
  });
});

describe("exportPostsCsv", () => {
  it("writes one row per slot joined to its draft and topic, with safe escaping", async () => {
    const t = newTest();
    const topic = await t.run(async (ctx) =>
      ctx.db.insert("topics", { title: "=HYPERLINK(\"x\")", pillar: "build", status: "ready", createdAt: 1 })
    );
    const draft = await t.run(async (ctx) =>
      ctx.db.insert("drafts", {
        topicId: topic,
        platform: "threads",
        body: 'Line one, "quoted"\nLine two',
        templateKey: "threads-hook-story",
        templateVersion: 1,
        format: "thread",
        charCount: 10,
        constraintOk: true,
        createdAt: 1,
      })
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("slots", {
        platform: "threads",
        draftId: draft,
        scheduledAt: Date.UTC(2026, 9, 5, 9, 0),
        status: "published",
        attempts: 1,
        publishedAt: Date.UTC(2026, 9, 5, 9, 1),
        publishedPlatformId: "post-123",
        createdAt: 1,
      });
      await ctx.db.insert("slots", {
        platform: "threads",
        draftId: draft,
        scheduledAt: Date.UTC(2026, 9, 6, 9, 0),
        status: "failed",
        attempts: 3,
        lastError: "boom, again",
        createdAt: 2,
      });
    });
    const out = await t.query(api.dataTools.exportPostsCsv, { today: "2026-10-05" });
    expect(out.filename).toBe("solo-queue-posts-2026-10-05.csv");
    expect(out.rows).toBe(2);
    expect(out.truncated).toBe(false);
    expect(out.content.startsWith("﻿platform,status,scheduled_at_iso,published_at_iso,topic,pillar,format,text,permalink_or_post_id,last_error\r\n")).toBe(true);
    expect(out.content).toContain(
      `threads,published,2026-10-05T09:00:00.000Z,2026-10-05T09:01:00.000Z,"'=HYPERLINK(""x"")",build,thread,"Line one, ""quoted""\nLine two",post-123,`
    );
    expect(out.content).toContain(`threads,failed,2026-10-06T09:00:00.000Z,,"'=HYPERLINK(""x"")",build,thread,"Line one, ""quoted""\nLine two",,"boom, again"`);
  });

  it("uses a plain filename when no date is passed or it is malformed", async () => {
    const t = newTest();
    expect((await t.query(api.dataTools.exportPostsCsv, {})).filename).toBe("solo-queue-posts.csv");
    expect((await t.query(api.dataTools.exportPostsCsv, { today: "../../etc" })).filename).toBe("solo-queue-posts.csv");
    expect((await t.query(api.dataTools.exportPostsCsv, {})).rows).toBe(0);
  });
});

describe("exportAllJson", () => {
  it("counts every table as the database does and never includes connections or tokens", async () => {
    const t = newTest();
    await seedEverything(t);
    await addConnection(t, "instagram");
    const out = await t.query(api.dataTools.exportAllJson, { today: "2026-10-05" });
    expect(out.filename).toBe("solo-queue-export-2026-10-05.json");
    expect(out.truncated).toEqual([]);

    const expected = {
      topics: 1,
      sources: 1,
      drafts: 1,
      slots: 1,
      frames: 1,
      templates: 1,
      publishReceipts: 1,
      appSettings: 1,
      mediaAssets: 1,
    };
    expect(out.counts).toEqual(expected);
    // Counts equal the database counts.
    for (const table of Object.keys(expected)) {
      const real = await t.run(async (ctx) => (await ctx.db.query(table as "topics").collect()).length);
      expect(out.counts[table]).toBe(real);
    }

    const parsed = JSON.parse(out.content);
    for (const table of Object.keys(expected)) expect(parsed[table]).toHaveLength(expected[table as keyof typeof expected]);
    expect(parsed.connections).toBeUndefined();
    expect(parsed.appSettings[0]._id).toBeUndefined();
    expect(parsed.appSettings[0]._creationTime).toBeUndefined();
    expect(parsed.appSettings[0].timezone).toBe(DEFAULT_SETTINGS.timezone);

    expect(out.content).not.toContain(TOKEN);
    expect(out.content).not.toContain("accessToken");
    expect(out.content).not.toContain("refreshToken");
    expect(out.content).not.toContain("tokenExpiresAt");
    expect(out.content).not.toContain("@founder");

    // Media: metadata only, no storage id, no signed URL.
    const media = parsed.mediaAssets[0];
    expect(media).toMatchObject({ filename: "hero.png", mimeType: "image/png", source: "upload", url: null, sizeBytes: 5 });
    expect(out.content).not.toContain("signed?token");
    expect(media.storageId).toBeUndefined();
    expect(media.publicUrl).toBeUndefined();
  });

  it("redacts a live token that a provider message echoed into a receipt or slot error", async () => {
    const t = newTest();
    await addConnection(t);
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    const slot = await insertSlot(t, draft, 1, { status: "failed" });
    await t.run(async (ctx) => {
      await ctx.db.patch(slot, { lastError: `GET /me?access_token=${TOKEN} failed` });
      await ctx.db.insert("publishReceipts", {
        slotId: slot,
        attemptedAt: 1,
        outcome: "permanent",
        providerMessage: `bad token ${TOKEN} and access_token=other-secret-value`,
      });
    });
    const out = await t.query(api.dataTools.exportAllJson, {});
    expect(out.content).not.toContain(TOKEN);
    expect(out.content).not.toContain("other-secret-value");
    expect(out.content).toContain("[redacted]");
  });
});

describe("disconnectAll", () => {
  it("deletes every connection and leaves everything else", async () => {
    const t = newTest();
    await seedEverything(t);
    await addConnection(t, "instagram");
    expect(await t.mutation(api.dataTools.disconnectAll, {})).toEqual({ removed: 2 });
    expect(await tableCount(t, "connections")).toBe(0);
    for (const table of ["topics", "drafts", "slots", "mediaAssets", "publishReceipts", "frames", "templates", "appSettings", "sources", "settings", "waitlist"] as const) {
      expect(await tableCount(t, table)).toBe(1);
    }
    expect(await t.mutation(api.dataTools.disconnectAll, {})).toEqual({ removed: 0 });
  });
});

describe("deleteEverything", () => {
  it("refuses unless the confirmation is exactly DELETE, and deletes nothing", async () => {
    const t = newTest();
    await seedEverything(t);
    for (const confirm of ["", "delete", "DELETE ", "Delete", "yes"]) {
      await expect(t.action(api.dataTools.deleteEverything, { confirm })).rejects.toThrow(/VALIDATION:CONFIRM: Type DELETE to confirm/);
    }
    for (const table of WIPE_TABLES) expect(await tableCount(t, table)).toBe(1);
    expect(await tableCount(t, "waitlist")).toBe(1);
  });

  it("is guarded: an anonymous caller is refused", async () => {
    const t = newAnonymousTest();
    await expect(t.action(api.dataTools.deleteEverything, { confirm: "DELETE" })).rejects.toThrow(/UNAUTHENTICATED/);
  });

  it("wipes every listed table and the stored files, and leaves the waitlist", async () => {
    const t = newTest();
    const { storageId } = await seedEverything(t);
    // An external asset has no stored file: its row still goes.
    await t.mutation(api.media.registerExternal, { url: "https://cdn.example.com/a.jpg", mimeType: "image/jpeg" });

    const out = await t.action(api.dataTools.deleteEverything, { confirm: "DELETE" });
    expect(out.deleted).toEqual({
      publishReceipts: 1,
      slots: 1,
      drafts: 1,
      sources: 1,
      mediaAssets: 2,
      topics: 1,
      frames: 1,
      templates: 1,
      appSettings: 1,
      settings: 1,
      connections: 1,
    });
    for (const table of WIPE_TABLES) expect(await tableCount(t, table)).toBe(0);
    expect(await tableCount(t, "waitlist")).toBe(1);
    const file = await t.run(async (ctx) => ctx.db.system.get("_storage", storageId));
    expect(file).toBeNull();
  });

  it("works across more rows than one batch", async () => {
    const t = newTest();
    const storageIds = await t.run(async (ctx) => {
      const ids = [];
      for (let i = 0; i < 7; i++) {
        const storageId = await ctx.storage.store(new Blob([`f${i}`], { type: "image/png" }));
        ids.push(storageId);
        await ctx.db.insert("mediaAssets", { storageId, publicUrl: `https://x/${i}`, mimeType: "image/png", createdAt: i });
        await ctx.db.insert("topics", { title: `t${i}`, status: "drafting", createdAt: i });
        await ctx.db.insert("connections", {
          platform: i % 2 === 0 ? "threads" : "instagram",
          platformUserId: `u${i}`,
          handle: "h",
          accessToken: "tok",
          tokenExpiresAt: 1,
          scopes: [],
          status: "healthy",
          lastCheckedAt: 1,
        });
        await ctx.db.insert("waitlist", { email: `w${i}@x.test`, createdAt: i });
      }
      return ids;
    });
    const out = await t.action(api.dataTools.deleteEverything, { confirm: "DELETE", batchSize: 3 });
    expect(out.deleted.mediaAssets).toBe(7);
    expect(out.deleted.topics).toBe(7);
    expect(out.deleted.connections).toBe(7);
    expect(await tableCount(t, "mediaAssets")).toBe(0);
    expect(await tableCount(t, "topics")).toBe(0);
    expect(await tableCount(t, "connections")).toBe(0);
    expect(await tableCount(t, "waitlist")).toBe(7);
    for (const id of storageIds) {
      expect(await t.run(async (ctx) => ctx.db.system.get("_storage", id))).toBeNull();
    }
  });

  it("deleteBatch only touches allow-listed tables", async () => {
    const t = newTest();
    await t.run(async (ctx) => ctx.db.insert("waitlist", { email: "a@x.test", createdAt: 1 }));
    await expect(t.mutation(internal.dataTools.deleteBatch, { table: "waitlist", batchSize: 10 })).rejects.toThrow(/NOT_WIPEABLE/);
    expect(await tableCount(t, "waitlist")).toBe(1);
  });

  it("covers every table in the schema: each is either wiped or deliberately kept", () => {
    const all = Object.keys(schema.tables).sort();
    const classified = [...WIPE_TABLES, ...KEEP_TABLES].sort();
    expect(classified).toEqual(all);
    expect(WIPE_TABLES.filter((x) => (KEEP_TABLES as readonly string[]).includes(x))).toEqual([]);
  });
});
