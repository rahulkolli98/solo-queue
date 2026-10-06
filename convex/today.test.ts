import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { insertDraft, insertSlot, insertTopic, newTest } from "../src/test-utils/convex";

const DAY = 86400000;
const NOW = Date.now();

async function connect(t: ReturnType<typeof newTest>, platform: "threads" | "instagram", status: "healthy" | "expiring" | "failed" = "healthy", expiresInDays = 40) {
  await t.run(async (ctx) =>
    ctx.db.insert("connections", {
      platform,
      platformUserId: "u1",
      handle: `@me-${platform}`,
      accessToken: "secret-token-value",
      tokenExpiresAt: NOW + expiresInDays * DAY,
      scopes: [],
      status,
      lastCheckedAt: NOW,
    })
  );
}

describe("today.summary", () => {
  it("is a first run when nothing was ever queued", async () => {
    const t = newTest();
    const out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    expect(out.firstRun).toBe(true);
    expect(out.steps).toEqual({ threadsConnected: false, hasTopic: false, queuedWeek: false });
    expect(out.upNext).toBeNull();
    expect(out.runway.threads.cells).toHaveLength(21);
    expect(out.alerts).toEqual([]);
  });

  it("ticks the checklist as the founder connects, adds a topic and queues", async () => {
    const t = newTest();
    await connect(t, "threads");
    await insertTopic(t, "First topic");
    let out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    expect(out.steps).toEqual({ threadsConnected: true, hasTopic: true, queuedWeek: false });
    expect(out.inbox.count).toBe(1);
    expect(out.inbox.top[0]).toMatchObject({ title: "First topic", ready: false, sourceCount: 0 });

    const topic = await insertTopic(t, "Queued topic");
    const draft = await insertDraft(t, topic, "threads", "Post one\n---\nPost two");
    await insertSlot(t, draft, NOW + 2 * 3600000);
    out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    expect(out.firstRun).toBe(false);
    expect(out.upNext).toMatchObject({ platform: "threads", body: "Post one", topicTitle: "Queued topic" });
    expect(out.runway.threads.posts).toBe(1);
  });

  it("never exposes the access token", async () => {
    const t = newTest();
    await connect(t, "threads");
    const out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    expect(JSON.stringify(out)).not.toContain("secret-token-value");
  });

  it("raises a failed-post alert first, with the provider reason", async () => {
    const t = newTest();
    await connect(t, "instagram");
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic, "instagram", "caption", "ig-caption-beats");
    const slot = await insertSlot(t, draft, NOW + DAY, { platform: "instagram", status: "failed" });
    await t.run(async (ctx) => ctx.db.patch(slot, { lastError: "Media URL not reachable" }));
    const out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    expect(out.alerts[0]).toMatchObject({ kind: "failed", platform: "instagram", detail: "Media URL not reachable", slotId: slot });
    expect(out.alerts[0].title).toMatch(/^Instagram post failed · /);
  });

  it("warns about an expiring token and a low queue, and respects dismissal and the toggles", async () => {
    const t = newTest();
    await connect(t, "threads", "healthy", 6);
    let out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    const kinds = out.alerts.map((a) => a.kind);
    expect(kinds).toEqual(["expiring", "coverage"]);
    expect(out.alerts[0].title).toBe("Threads token expires in 6 days.");
    // With nothing queued the alert says only what to do; with posts queued it says how many depend on the token.
    expect(out.alerts[0].detail).toBe("Reconnect before the slots start failing.");
    const coverage = out.alerts[1];
    expect(coverage.title).toBe("Threads has 0 days written.");

    // Dismiss the coverage nudge for this week.
    await t.mutation(api.settings.update, {
      patch: { dismissedNudges: [coverage.dismissKey!] },
    });
    out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    expect(out.alerts.map((a) => a.kind)).toEqual(["expiring"]);

    // Turn the expiring alert off.
    const current = await t.query(api.settings.get, {});
    await t.mutation(api.settings.update, {
      patch: { notifications: { ...current.notifications, tokenExpiring: false } },
    });
    out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    expect(out.alerts).toEqual([]);
  });

  it("says how many queued posts depend on an expiring token", async () => {
    const t = newTest();
    await connect(t, "threads", "healthy", 6);
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic, "threads", "Post one");
    await insertSlot(t, draft, NOW + 2 * DAY, { platform: "threads" });
    await insertSlot(t, draft, NOW + 3 * DAY, { platform: "threads" });
    const out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    const expiring = out.alerts.find((a) => a.kind === "expiring");
    expect(expiring?.detail).toBe("2 scheduled posts depend on it. Reconnect before the slots start failing.");
  });

  it("turning 'queue running low' off hides the coverage banner, and 'post failed' off hides the failed one", async () => {
    const t = newTest();
    await connect(t, "threads");
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic, "threads", "Post one");
    await insertSlot(t, draft, NOW + DAY, { platform: "threads", status: "failed" });
    let out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    expect(out.alerts.map((a) => a.kind)).toEqual(["failed", "coverage"]);

    const current = await t.query(api.settings.get, {});
    await t.mutation(api.settings.update, {
      patch: { notifications: { ...current.notifications, queueLow: false } },
    });
    out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    expect(out.alerts.map((a) => a.kind)).toEqual(["failed"]);

    await t.mutation(api.settings.update, {
      patch: { notifications: { ...current.notifications, queueLow: false, postFailed: false } },
    });
    out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    expect(out.alerts).toEqual([]);
  });

  it("builds the pillar mix from queued posts and the target from settings", async () => {
    const t = newTest();
    const a = await insertTopic(t, "A");
    const b = await insertTopic(t, "B");
    await t.run(async (ctx) => {
      await ctx.db.patch(a, { pillar: "tools" });
      await ctx.db.patch(b, { pillar: "build" });
    });
    const d1 = await insertDraft(t, a, "threads", "a", "k1");
    const d2 = await insertDraft(t, b, "threads", "b", "k2");
    await insertSlot(t, d1, NOW + DAY);
    await insertSlot(t, d2, NOW + 2 * DAY);
    const out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    const tools = out.pillarMix.find((p) => p.key === "tools")!;
    expect(tools).toMatchObject({ count: 1, actual: 50, target: 30 });
    expect(out.pillarMix).toHaveLength(4);
  });

  it("reports usage in the last 24 hours against Meta's limits", async () => {
    const t = newTest();
    await connect(t, "threads");
    const topic = await insertTopic(t);
    const draft = await insertDraft(t, topic);
    const slot = await insertSlot(t, draft, NOW - 3600000, { status: "published" });
    await t.run(async (ctx) => {
      await ctx.db.insert("publishReceipts", { slotId: slot, attemptedAt: NOW - 3600000, outcome: "success" });
      await ctx.db.insert("publishReceipts", { slotId: slot, attemptedAt: NOW - 3 * DAY, outcome: "success" });
    });
    const out = await t.query(api.today.summary, { now: NOW, tz: "UTC" });
    const threads = out.meta.connections.find((c) => c.platform === "threads")!;
    expect(threads).toMatchObject({ connected: true, used24h: 1, limit: 250 });
    expect(out.meta.feesThisMonth).toBe(0);
  });
});
