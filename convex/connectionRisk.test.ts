import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { slotRisk } from "./lib/connectionRisk";
import { insertDraft, insertSlot, insertTopic, newTest } from "../src/test-utils/convex";

const DAY = 86400000;
const healthy = { status: "healthy" as const, tokenExpiresAt: Date.now() + 40 * DAY };

describe("slotRisk", () => {
  it("is fine for a healthy connection", () => {
    expect(slotRisk("threads", "scheduled", Date.now() + DAY, healthy)).toBeNull();
  });
  it("flags a missing or failed connection, in words", () => {
    expect(slotRisk("instagram", "scheduled", Date.now() + DAY, undefined)).toMatch(/Instagram is not connected/);
    expect(slotRisk("threads", "scheduled", Date.now() + DAY, { ...healthy, status: "failed" })).toMatch(
      /Threads token refresh failed/
    );
  });
  it("flags an expiring token only when it expires before the post", () => {
    const soon = { status: "expiring" as const, tokenExpiresAt: Date.now() + 2 * DAY };
    expect(slotRisk("threads", "scheduled", Date.now() + DAY, soon)).toBeNull();
    expect(slotRisk("threads", "scheduled", Date.now() + 3 * DAY, soon)).toMatch(/token expires before this posts/);
  });
  it("only scheduled posts are at risk", () => {
    for (const status of ["claimed", "published", "failed"] as const) {
      expect(slotRisk("threads", status, Date.now(), undefined)).toBeNull();
    }
  });
});

describe("queue board at-risk flags", () => {
  async function connect(t: ReturnType<typeof newTest>, status: "healthy" | "failed") {
    await t.run(async (ctx) =>
      ctx.db.insert("connections", {
        platform: "threads",
        platformUserId: "u1",
        handle: "me",
        accessToken: "SECRET-TOKEN",
        tokenExpiresAt: Date.now() + 30 * DAY,
        scopes: [],
        status,
        lastCheckedAt: Date.now(),
      })
    );
  }

  it("marks scheduled cards when the connection failed, and never leaks the token", async () => {
    const t = newTest();
    await connect(t, "failed");
    const draft = await insertDraft(t, await insertTopic(t));
    const at = Date.now() + 2 * 3600000;
    const slot = await insertSlot(t, draft, at);
    const board = await t.query(api.queueBoard.dayColumns, { from: Date.now() - 3600000, days: 3, tz: "UTC" });
    const cards = board.days.flatMap((d) => d.threads);
    expect(cards).toHaveLength(1);
    expect(cards[0].atRisk).toMatch(/token refresh failed/);
    const detail = await t.query(api.queueBoard.detail, { id: slot });
    expect(detail?.atRisk).toMatch(/token refresh failed/);
    expect(JSON.stringify([board, detail])).not.toContain("SECRET-TOKEN");
  });

  it("leaves cards unflagged when the connection is healthy", async () => {
    const t = newTest();
    await connect(t, "healthy");
    const draft = await insertDraft(t, await insertTopic(t));
    await insertSlot(t, draft, Date.now() + 2 * 3600000);
    const board = await t.query(api.queueBoard.dayColumns, { from: Date.now() - 3600000, days: 3, tz: "UTC" });
    expect(board.days.flatMap((d) => d.threads)[0].atRisk).toBeNull();
  });
});
