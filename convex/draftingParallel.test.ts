import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { insertTopic, newTest } from "../src/test-utils/convex";

/**
 * TASK-042: generation used to write the four formats one after another, so a slow model made the founder
 * wait for the SUM of four calls (about 134 s on the chosen model; the target is 45 s). The calls now run side
 * by side. These tests pin that, and that drafts which land are kept when one format fails.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const REEL_MARK = "30-second talking-head reel script";
const BLOG_MARK = "Write a short blog draft";

function reply(content: string) {
  return new Response(
    JSON.stringify({
      id: "cmpl-1",
      object: "chat.completion",
      created: 1,
      model: "test-model",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

/** A model that answers after `delayMs` and records how many calls were in flight at once. */
function slowModel(opts: { delayMs: number; failWhen?: (body: string) => boolean }) {
  let inFlight = 0;
  let maxInFlight = 0;
  vi.stubEnv("LLM_API_KEY", "test-key");
  vi.stubEnv("LLM_MODEL", "test-model");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = String(init?.body ?? "");
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, opts.delayMs));
      inFlight -= 1;
      if (opts.failWhen?.(body)) {
        // 401 is not retried by the SDK, so a failing format fails at once (a 500 would be retried with a long back-off).
        return new Response(JSON.stringify({ error: { message: "invalid api key", code: 401 } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return reply("First post.\n---\nSecond post.");
    })
  );
  return { maxInFlight: () => maxInFlight };
}

describe("generation runs the formats side by side", () => {
  it("has all four model calls in flight at once, so the wait is the slowest call, not the sum of them", async () => {
    const model = slowModel({ delayMs: 120 });
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    const out = await t.action(api.drafting.generate, { topicId: topic });
    expect(out.drafts.map((d) => d.format)).toEqual(["threads", "instagram-caption", "instagram-reel", "blog"]);
    expect(model.maxInFlight()).toBeGreaterThanOrEqual(4);
    // Written one after another, never more than one call would be open at a time.
  });

  it("stores every draft that landed when one format fails, and reports the failure", async () => {
    slowModel({ delayMs: 10, failWhen: (body) => body.includes(REEL_MARK) });
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    await expect(t.action(api.drafting.generate, { topicId: topic })).rejects.toThrow(/LLM_/);
    const kept = await t.run(async (ctx) => {
      const rows = await ctx.db.query("drafts").collect();
      return rows.map((d) => d.templateKey).sort();
    });
    expect(kept).toEqual(["blog-draft", "ig-caption-beats", "threads-hook-story"]);
    // The topic is not marked ready while a format is missing.
    const row = await t.run(async (ctx) => ctx.db.get(topic));
    expect(row?.status).not.toBe("ready");
  });

  it("reports the first failure in format order when several fail", async () => {
    slowModel({ delayMs: 10, failWhen: (body) => body.includes(REEL_MARK) || body.includes(BLOG_MARK) });
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    await expect(t.action(api.drafting.generate, { topicId: topic })).rejects.toThrow();
    const kept = await t.run(async (ctx) => (await ctx.db.query("drafts").collect()).map((d) => d.templateKey).sort());
    expect(kept).toEqual(["ig-caption-beats", "threads-hook-story"]);
  });
});
