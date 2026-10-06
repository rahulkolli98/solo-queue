import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import { insertDraft, insertSlot, insertTopic, newTest } from "../src/test-utils/convex";

const MIN = 60_000;

describe("slots.claimDue", () => {
  it("claims only due scheduled slots, oldest first, and marks them claimed", async () => {
    const t = newTest();
    const now = Date.now();
    const topic = await insertTopic(t);
    const d1 = await insertDraft(t, topic);
    const d2 = await insertDraft(t, topic);
    const d3 = await insertDraft(t, topic);
    const later = await insertSlot(t, d1, now + 60 * MIN);
    const second = await insertSlot(t, d2, now - 3 * MIN);
    const first = await insertSlot(t, d3, now - 10 * MIN);

    const claimed = await t.mutation(internal.slots.claimDue, { now });
    expect(claimed).toEqual([first, second]);

    const rows = await t.run(async (ctx) => ({
      first: await ctx.db.get(first),
      second: await ctx.db.get(second),
      later: await ctx.db.get(later),
    }));
    expect(rows.first?.status).toBe("claimed");
    expect(rows.second?.status).toBe("claimed");
    expect(rows.later?.status).toBe("scheduled");
  });

  it("never hands the same slot to two callers", async () => {
    const t = newTest();
    const now = Date.now();
    const topic = await insertTopic(t);
    const ids = [];
    for (let i = 0; i < 6; i++) {
      const d = await insertDraft(t, topic);
      ids.push(await insertSlot(t, d, now - (i + 1) * MIN));
    }
    // convex-test runs mutations one at a time; this proves the claimed rows are
    // excluded from the next claim (the OCC single-winner guarantee itself is Convex's).
    const a = await t.mutation(internal.slots.claimDue, { now, limit: 4 });
    const b = await t.mutation(internal.slots.claimDue, { now, limit: 4 });
    expect(a).toHaveLength(4);
    expect(b).toHaveLength(2);
    expect(new Set([...a, ...b]).size).toBe(6);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });

  it("respects the cap and clamps it to 25", async () => {
    const t = newTest();
    const now = Date.now();
    const topic = await insertTopic(t);
    for (let i = 0; i < 30; i++) {
      const d = await insertDraft(t, topic);
      await insertSlot(t, d, now - (i + 1) * MIN);
    }
    expect(await t.mutation(internal.slots.claimDue, { now, limit: 3 })).toHaveLength(3);
    expect(await t.mutation(internal.slots.claimDue, { now, limit: 500 })).toHaveLength(25);
  });

  it("skips slots that are already claimed, published or failed", async () => {
    const t = newTest();
    const now = Date.now();
    const topic = await insertTopic(t);
    for (const status of ["claimed", "published", "failed"] as const) {
      const d = await insertDraft(t, topic);
      await insertSlot(t, d, now - 5 * MIN, { status });
    }
    expect(await t.mutation(internal.slots.claimDue, { now })).toEqual([]);
  });
});

describe("slots.release", () => {
  it("returns a claimed slot to scheduled, bumps attempts and honours notBefore", async () => {
    const t = newTest();
    const now = Date.now();
    const topic = await insertTopic(t);
    const d = await insertDraft(t, topic);
    const slot = await insertSlot(t, d, now - 5 * MIN, { status: "claimed", attempts: 1 });

    const out = await t.mutation(internal.slots.release, {
      id: slot,
      notBefore: now + 30 * MIN,
    });
    expect(out.attempts).toBe(2);
    const row = await t.run(async (ctx) => ctx.db.get(slot));
    expect(row?.status).toBe("scheduled");
    expect(row?.scheduledAt).toBe(now + 30 * MIN);
  });

  it("refuses to release a slot that is not claimed", async () => {
    const t = newTest();
    const topic = await insertTopic(t);
    const d = await insertDraft(t, topic);
    const slot = await insertSlot(t, d, Date.now() + MIN);
    await expect(t.mutation(internal.slots.release, { id: slot })).rejects.toThrow(/BAD_STATE/);
  });
});
