import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { HEARTBEAT_STALE_MS } from "./publishLog";
import { insertDraft, insertSlot, insertTopic, newTest } from "../src/test-utils/convex";

afterEach(() => vi.unstubAllEnvs());

const NOW = Date.now();

describe("publishLog.status", () => {
  it("reports dry-run mode by default and live only for PUBLISH_DRY_RUN=0", async () => {
    const t = newTest();
    vi.stubEnv("PUBLISH_DRY_RUN", "");
    expect((await t.query(api.publishLog.status, { now: NOW })).mode).toBe("dry-run");
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    expect((await t.query(api.publishLog.status, { now: NOW })).mode).toBe("live");
  });

  it("has no heartbeat before the first tick, then a fresh one, then a stale one", async () => {
    const t = newTest();
    expect((await t.query(api.publishLog.status, { now: NOW })).heartbeat).toBeNull();

    await t.mutation(internal.publish.recordHeartbeat, { at: NOW - 30_000, claimed: 2, published: 1, failed: 1 });
    let status = await t.query(api.publishLog.status, { now: NOW });
    expect(status.heartbeat).toMatchObject({ claimed: 2, published: 1, failed: 1, ageSeconds: 30, stale: false });

    status = await t.query(api.publishLog.status, { now: NOW + HEARTBEAT_STALE_MS + 60_000 });
    expect(status.heartbeat?.stale).toBe(true);
  });

  it("shows the pause reason and 24h usage against Meta's limits", async () => {
    const t = newTest();
    await t.mutation(internal.publish.setPublishPausedInternal, { paused: true, reason: "auth-threads: rejected" });
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    const slot = await insertSlot(t, draft, NOW - 3600_000, { status: "published" });
    await t.run(async (ctx) => {
      await ctx.db.insert("publishReceipts", { slotId: slot, attemptedAt: NOW - 3600_000, outcome: "success" });
      await ctx.db.insert("publishReceipts", { slotId: slot, attemptedAt: NOW - 2 * 86400000, outcome: "success" });
    });
    const status = await t.query(api.publishLog.status, { now: NOW });
    expect(status.paused).toMatchObject({ paused: true, reason: "auth-threads: rejected" });
    expect(status.usage24h).toEqual({ threads: 1, instagram: 0 });
    expect(status.limits).toEqual({ threads: 250, instagram: 100 });
  });
});

describe("publishLog.attempts", () => {
  it("lists attempts newest first with their post, and filters by outcome", async () => {
    const t = newTest();
    const topic = await insertTopic(t, "Fees");
    const draft = await insertDraft(t, topic, "threads", "Post body\n---\nmore");
    const slot = await insertSlot(t, draft, NOW, { status: "failed" });
    await t.run(async (ctx) => {
      await ctx.db.insert("publishReceipts", { slotId: slot, attemptedAt: 1000, outcome: "retryable", providerMessage: "timeout" });
      await ctx.db.insert("publishReceipts", { slotId: slot, attemptedAt: 2000, outcome: "permanent", providerMessage: "bad media" });
    });
    const all = await t.query(api.publishLog.attempts, {});
    expect(all.map((a) => a.providerMessage)).toEqual(["bad media", "timeout"]);
    expect(all[0]).toMatchObject({ platform: "threads", topicTitle: "Fees", snippet: "Post body", slotStatus: "failed" });
    const failed = await t.query(api.publishLog.attempts, { outcome: "permanent" });
    expect(failed).toHaveLength(1);
    expect(await t.query(api.publishLog.attempts, { limit: 1 })).toHaveLength(1);
  });
});
