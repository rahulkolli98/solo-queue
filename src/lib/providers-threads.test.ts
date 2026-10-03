import { describe, expect, it } from "vitest";
import {
  publishThreadsPost,
  resumeThreadsContainer,
  type ThreadsPostInput,
} from "../../convex/providers/threads";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetch(plan: (Response | Error)[]) {
  const calls: { url: string; body: string }[] = [];
  let i = 0;
  const fn = (async (url: unknown, init?: { body?: unknown }) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    const next = plan[Math.min(i++, plan.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fn, calls };
}

function clock(start = 1_000_000) {
  let t = start;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleepMs: async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
    sleeps,
  };
}

const TEXT: ThreadsPostInput = {
  userId: "u1",
  accessToken: "tok",
  text: "hello",
  mediaType: "TEXT",
};

describe("publishThreadsPost replies", () => {
  it("sends reply_to_id on the container request when replying", async () => {
    const m = mockFetch([json({ id: "c2" }), json({ status: "FINISHED" }), json({ id: "m2" })]);
    const out = await publishThreadsPost(
      { ...TEXT, replyToId: "m1" },
      { fetchImpl: m.fn, ...clock() }
    );
    expect(out).toMatchObject({ ok: true, mediaId: "m2" });
    expect(JSON.parse(m.calls[0].body)).toMatchObject({ text: "hello", reply_to_id: "m1" });
  });

  it("omits reply_to_id for a normal post", async () => {
    const m = mockFetch([json({ id: "c1" }), json({ status: "FINISHED" }), json({ id: "m1" })]);
    await publishThreadsPost(TEXT, { fetchImpl: m.fn, ...clock() });
    expect(JSON.parse(m.calls[0].body)).not.toHaveProperty("reply_to_id");
  });
});

describe("publishThreadsPost", () => {
  it("publishes text via the fast path when the container is instantly ready", async () => {
    const { fn, calls } = mockFetch([
      json({ id: "c1" }),
      json({ status: "FINISHED" }),
      json({ id: "m1" }),
    ]);
    const c = clock();
    const out = await publishThreadsPost(TEXT, {
      fetchImpl: fn,
      sleepMs: c.sleepMs,
      now: c.now,
    });
    expect(out).toEqual({ ok: true, mediaId: "m1", via: "fast" });
    expect(c.sleeps).toEqual([]);
    expect(calls.map((x) => x.url)).toEqual([
      expect.stringContaining("/u1/threads"),
      expect.stringContaining("/c1?"),
      expect.stringContaining("/threads_publish"),
    ]);
  });

  it("polls media through processing then publishes", async () => {
    const { fn } = mockFetch([
      json({ id: "c9" }),
      json({ status: "IN_PROGRESS" }),
      json({ status: "IN_PROGRESS" }),
      json({ status: "FINISHED" }),
      json({ id: "m9" }),
    ]);
    const c = clock();
    const out = await publishThreadsPost(
      { ...TEXT, mediaType: "IMAGE", mediaUrl: "https://x.test/a.jpg" },
      { fetchImpl: fn, sleepMs: c.sleepMs, now: c.now }
    );
    expect(out).toEqual({ ok: true, mediaId: "m9", via: "polled" });
    expect(c.sleeps).toEqual([5000, 5000]);
  });

  it("fails terminally when the container errors", async () => {
    const { fn } = mockFetch([
      json({ id: "c2" }),
      json({ status: "ERROR", error_message: "bad image" }),
    ]);
    const out = await publishThreadsPost(
      { ...TEXT, mediaType: "IMAGE", mediaUrl: "https://x.test/a.jpg" },
      { fetchImpl: fn, ...clock() }
    );
    expect(out).toMatchObject({
      ok: false,
      retryable: false,
      code: "CONTAINER_ERROR",
      containerId: "c2",
    });
    expect((out as { message: string }).message).toContain("bad image");
  });

  it("maps 401 to AUTH (non-retryable) and 500 to TRANSIENT (retryable)", async () => {
    const a = mockFetch([json({ error_message: "bad token" }, 401)]);
    const auth = await publishThreadsPost(TEXT, { fetchImpl: a.fn, ...clock() });
    expect(auth).toMatchObject({ ok: false, retryable: false, code: "AUTH" });

    const b = mockFetch([json({ error_message: "oops" }, 500)]);
    const transient = await publishThreadsPost(TEXT, { fetchImpl: b.fn, ...clock() });
    expect(transient).toMatchObject({ ok: false, retryable: true, code: "TRANSIENT" });
  });

  it("maps a network throw to retryable NETWORK", async () => {
    const { fn } = mockFetch([new Error("socket hang up")]);
    const out = await publishThreadsPost(TEXT, { fetchImpl: fn, ...clock() });
    expect(out).toMatchObject({ ok: false, retryable: true, code: "NETWORK" });
  });

  it("returns the container for resume when media never finishes", async () => {
    const { fn, calls } = mockFetch([json({ id: "c3" }), json({ status: "IN_PROGRESS" })]);
    const c = clock();
    // Jump past the 5-minute media budget on the first sleep.
    const realSleep = c.sleepMs;
    const out = await publishThreadsPost(
      { ...TEXT, mediaType: "VIDEO", mediaUrl: "https://x.test/v.mp4" },
      {
        fetchImpl: fn,
        now: c.now,
        sleepMs: async (ms) => {
          await realSleep(ms);
          c.advance(10 * 60_000);
        },
      }
    );
    expect(out).toMatchObject({
      ok: false,
      retryable: true,
      code: "POLL_TIMEOUT",
      containerId: "c3",
    });
    expect(calls.some((x) => x.url.includes("threads_publish"))).toBe(false);
  });

  it("attempts publish on text timeout (proven Phase 1 behavior)", async () => {
    const { fn } = mockFetch([
      json({ id: "c4" }),
      json({ status: "IN_PROGRESS" }),
      json({ status: "IN_PROGRESS" }),
      json({ id: "m4" }),
    ]);
    const c = clock();
    const out = await publishThreadsPost(
      TEXT,
      {
        fetchImpl: fn,
        now: c.now,
        sleepMs: async (ms) => {
          c.advance(61_000);
          void ms;
        },
      }
    );
    expect(out).toEqual({ ok: true, mediaId: "m4", via: "polled" });
  });

  it("refuses media posts without a URL before any network call", async () => {
    const { fn, calls } = mockFetch([]);
    const out = await publishThreadsPost(
      { ...TEXT, mediaType: "IMAGE" },
      { fetchImpl: fn, ...clock() }
    );
    expect(out).toMatchObject({ ok: false, retryable: false, code: "NO_MEDIA" });
    expect(calls).toEqual([]);
  });
});

describe("resumeThreadsContainer", () => {
  it("polls an existing container with a fresh budget then publishes", async () => {
    const { fn } = mockFetch([
      json({ status: "IN_PROGRESS" }),
      json({ status: "FINISHED" }),
      json({ id: "m5" }),
    ]);
    const c = clock();
    const out = await resumeThreadsContainer(
      { userId: "u1", accessToken: "tok", containerId: "c5", mediaType: "VIDEO" },
      { fetchImpl: fn, sleepMs: c.sleepMs, now: c.now }
    );
    expect(out).toEqual({ ok: true, mediaId: "m5", via: "polled" });
  });
});
