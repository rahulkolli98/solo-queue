import { describe, expect, it } from "vitest";
import {
  publishInstagramPost,
  resumeInstagramContainer,
  type InstagramPostInput,
} from "../../convex/providers/instagram";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function headOk(): Response {
  return new Response(null, { status: 200 });
}

function mockFetch(plan: (Response | Error)[]) {
  const calls: { url: string; method: string }[] = [];
  let i = 0;
  const fn = (async (url: unknown, init?: { method?: string }) => {
    calls.push({ url: String(url), method: init?.method ?? "GET" });
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

const PHOTO: InstagramPostInput = {
  igUserId: "ig1",
  accessToken: "tok",
  caption: "caption",
  mediaUrl: "https://x.test/a.jpg",
  mimeType: "image/jpeg",
  kind: "photo",
};

describe("publishInstagramPost", () => {
  it("publishes a photo immediately after pre-flight", async () => {
    const { fn, calls } = mockFetch([
      headOk(), // reachability
      json({ id: "ig1" }), // identity
      json({ id: "c1" }), // container
      json({ id: "m1" }), // publish
    ]);
    const c = clock();
    const out = await publishInstagramPost(PHOTO, {
      fetchImpl: fn,
      sleepMs: c.sleepMs,
      now: c.now,
    });
    expect(out).toEqual({ ok: true, mediaId: "m1", via: "fast" });
    expect(c.sleeps).toEqual([]);
    expect(calls.some((x) => x.url.includes("media_publish"))).toBe(true);
  });

  it("polls a reel through processing then publishes", async () => {
    const { fn } = mockFetch([
      headOk(),
      json({ id: "ig1" }),
      json({ id: "c9" }),
      json({ status_code: "IN_PROGRESS" }),
      json({ status_code: "FINISHED" }),
      json({ id: "m9" }),
    ]);
    const c = clock();
    const out = await publishInstagramPost(
      {
        ...PHOTO,
        kind: "reel",
        mediaUrl: "https://x.test/v.mp4",
        mimeType: "video/mp4",
      },
      { fetchImpl: fn, sleepMs: c.sleepMs, now: c.now }
    );
    expect(out).toEqual({ ok: true, mediaId: "m9", via: "polled" });
    expect(c.sleeps).toEqual([5000]);
  });

  it("unreachable media returns permanent without calling publish", async () => {
    const { fn, calls } = mockFetch([
      new Response(null, { status: 404 }), // HEAD fails, no Range fallback helps a 404
      json({ id: "ig1" }),
    ]);
    const out = await publishInstagramPost(
      { ...PHOTO, mediaUrl: "https://x.test/dead.jpg" },
      { fetchImpl: fn, ...clock() }
    );
    expect(out).toMatchObject({ ok: false, retryable: false, code: "MEDIA_UNREACHABLE" });
    expect(calls.some((x) => x.url.includes("media_publish"))).toBe(false);
    expect(calls.some((x) => x.method === "POST")).toBe(false);
  });

  it("unsupported formats are refused before any network call", async () => {
    const { fn, calls } = mockFetch([]);
    const out = await publishInstagramPost(
      { ...PHOTO, mimeType: "image/gif" },
      { fetchImpl: fn, ...clock() }
    );
    expect(out).toMatchObject({ ok: false, retryable: false, code: "UNSUPPORTED_FORMAT" });
    expect(calls).toEqual([]);
  });

  it("a failing identity check is permanent AUTH", async () => {
    const { fn } = mockFetch([
      headOk(),
      json({ error: { message: "personal account", code: 400 } }, 400),
    ]);
    const out = await publishInstagramPost(PHOTO, { fetchImpl: fn, ...clock() });
    expect(out).toMatchObject({ ok: false, retryable: false, code: "AUTH" });
  });

  it("reel timeout returns the container for resume without publishing", async () => {
    const { fn, calls } = mockFetch([
      headOk(),
      json({ id: "ig1" }),
      json({ id: "c3" }),
      json({ status_code: "IN_PROGRESS" }),
    ]);
    const c = clock();
    const out = await publishInstagramPost(
      {
        ...PHOTO,
        kind: "reel",
        mediaUrl: "https://x.test/v.mp4",
        mimeType: "video/mp4",
      },
      {
        fetchImpl: fn,
        now: c.now,
        sleepMs: async (ms) => {
          c.advance(10 * 60_000);
          void ms;
        },
      }
    );
    expect(out).toMatchObject({
      ok: false,
      retryable: true,
      code: "POLL_TIMEOUT",
      containerId: "c3",
    });
    expect(calls.some((x) => x.url.includes("media_publish"))).toBe(false);
  });

  it("over-long captions never reach the network", async () => {
    const { fn, calls } = mockFetch([]);
    const out = await publishInstagramPost(
      { ...PHOTO, caption: "x".repeat(2201) },
      { fetchImpl: fn, ...clock() }
    );
    expect(out).toMatchObject({ ok: false, code: "CAPTION_LONG" });
    expect(calls).toEqual([]);
  });
});

describe("resumeInstagramContainer", () => {
  it("polls an existing reel container with a fresh budget then publishes", async () => {
    const { fn } = mockFetch([
      json({ status_code: "FINISHED" }),
      json({ id: "m5" }),
    ]);
    const c = clock();
    const out = await resumeInstagramContainer(
      { igUserId: "ig1", accessToken: "tok", containerId: "c5" },
      { fetchImpl: fn, sleepMs: c.sleepMs, now: c.now }
    );
    expect(out).toEqual({ ok: true, mediaId: "m5", via: "fast" });
  });
});
