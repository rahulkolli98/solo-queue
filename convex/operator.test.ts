import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { OPERATOR_ISSUER } from "./lib/operatorConfig";
import { insertTopic, newAnonymousTest, newTest } from "../src/test-utils/convex";

const UNAUTH = /UNAUTHENTICATED/;

describe("operator guard", () => {
  it("refuses an anonymous query, mutation and action", async () => {
    const t = newAnonymousTest();
    await expect(t.query(api.settings.get, {})).rejects.toThrow(UNAUTH);
    await expect(t.mutation(api.topics.create, { title: "nope" })).rejects.toThrow(UNAUTH);
    const topic = await insertTopic(t);
    await expect(t.action(api.research.angles, { topicId: topic })).rejects.toThrow(UNAUTH);
    // Nothing was written by the refused mutation.
    expect(await t.run(async (ctx) => (await ctx.db.query("topics").collect()).length)).toBe(1);
  });

  it("refuses a signed-in caller who is not the operator", async () => {
    const t = newAnonymousTest().withIdentity({
      issuer: OPERATOR_ISSUER,
      subject: "someone-else",
      tokenIdentifier: `${OPERATOR_ISSUER}|someone-else`,
    });
    await expect(t.query(api.settings.get, {})).rejects.toThrow(UNAUTH);
    const otherIssuer = newAnonymousTest().withIdentity({
      issuer: "https://elsewhere.example",
      subject: "operator",
      tokenIdentifier: "https://elsewhere.example|operator",
    });
    await expect(otherIssuer.query(api.settings.get, {})).rejects.toThrow(UNAUTH);
  });

  it("lets the operator through", async () => {
    const t = newTest();
    await expect(t.query(api.settings.get, {})).resolves.toBeTruthy();
    const id = await t.mutation(api.topics.create, { title: "A topic" });
    expect(id).toBeTruthy();
  });

  it("keeps the landing page's waitlist public", async () => {
    const t = newAnonymousTest();
    await expect(t.query(api.waitlist.count, {})).resolves.toBeDefined();
    await expect(t.mutation(api.waitlist.join, { email: "fan@example.com" })).resolves.toBeTruthy();
  });

  it("does not echo anything sensitive in the refusal", async () => {
    const t = newAnonymousTest();
    const err = await t.query(api.connections.listPublic, {}).catch((e: unknown) => e);
    expect(String((err as { data?: unknown }).data ?? err)).toMatch(/^UNAUTHENTICATED: Sign in again/);
  });
});
