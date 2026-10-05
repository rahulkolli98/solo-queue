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
  it("publishes a photo once the container reports FINISHED, with no waiting when it already is", async () => {
    const { fn, calls } = mockFetch([
      headOk(), // reachability
      json({ id: "ig1" }), // identity
      json({ id: "c1" }), // container
      json({ status_code: "FINISHED" }), // status poll
      json({ id: "m1" }), // publish
    ]);
    const c = clock();
    const out = await publishInstagramPost(PHOTO, { fetchImpl: fn, sleepMs: c.sleepMs, now: c.now });
    expect(out).toEqual({ ok: true, mediaId: "m1", via: "fast" });
    expect(c.sleeps).toEqual([]);
    const urls = calls.map((x) => x.url);
    const poll = urls.findIndex((u) => u.includes("status_code"));
    const publish = urls.findIndex((u) => u.includes("media_publish"));
    expect(poll).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(poll); // never publishes before checking the container
  });

  it("waits for a photo container that is still IN_PROGRESS instead of publishing at once (the first live failure)", async () => {
    const { fn } = mockFetch([
      headOk(),
      json({ id: "ig1" }),
      json({ id: "c1" }),
      json({ status_code: "IN_PROGRESS" }),
      json({ status_code: "FINISHED" }),
      json({ id: "m1" }),
    ]);
    const c = clock();
    const out = await publishInstagramPost(PHOTO, { fetchImpl: fn, sleepMs: c.sleepMs, now: c.now });
    expect(out).toEqual({ ok: true, mediaId: "m1", via: "polled" });
    expect(c.sleeps).toEqual([5000]);
  });

  it("retries publish when Instagram answers 'Media ID is not available', and then succeeds", async () => {
    const notReady = () => json({ error: { message: "Media ID is not available", code: 9007, error_subcode: 2207027 } }, 400);
    const { fn } = mockFetch([
      headOk(),
      json({ id: "ig1" }),
      json({ id: "c1" }),
      json({ status_code: "FINISHED" }),
      notReady(),
      notReady(),
      json({ id: "m1" }),
    ]);
    const c = clock();
    const out = await publishInstagramPost(PHOTO, { fetchImpl: fn, sleepMs: c.sleepMs, now: c.now });
    expect(out).toMatchObject({ ok: true, mediaId: "m1" });
    expect(c.sleeps).toEqual([3000, 6000]);
  });

  it("when it never becomes ready, hands back a RETRYABLE failure with the container so the tick resumes it", async () => {
    const notReady = () => json({ error: { message: "Media ID is not available", code: 9007, error_subcode: 2207027 } }, 400);
    const { fn } = mockFetch([headOk(), json({ id: "ig1" }), json({ id: "c1" }), json({ status_code: "FINISHED" }), notReady(), notReady(), notReady(), notReady()]);
    const c = clock();
    const out = await publishInstagramPost(PHOTO, { fetchImpl: fn, sleepMs: c.sleepMs, now: c.now });
    expect(out).toMatchObject({ ok: false, retryable: true, code: "NOT_READY", containerId: "c1" });
    expect((out as { message: string }).message).toContain("Media ID is not available (code 9007, subcode 2207027)");
    expect(c.sleeps).toEqual([3000, 6000, 12000]);
  });

  it("a photo container still processing after a minute is handed back to resume, not failed", async () => {
    const { fn } = mockFetch([headOk(), json({ id: "ig1" }), json({ id: "c1" }), json({ status_code: "IN_PROGRESS" })]);
    const c = clock();
    const out = await publishInstagramPost(PHOTO, { fetchImpl: fn, sleepMs: c.sleepMs, now: c.now });
    expect(out).toMatchObject({ ok: false, retryable: true, code: "POLL_TIMEOUT", containerId: "c1" });
  });

  it("when Instagram rejects the image itself, the message carries Instagram's own reason", async () => {
    const { fn } = mockFetch([
      headOk(),
      json({ id: "ig1" }),
      json({ id: "c1" }),
      json({ status_code: "ERROR", status: "Error: Media upload has failed with error code 2207052 (the image format is not supported)" }),
    ]);
    const c = clock();
    const out = await publishInstagramPost(PHOTO, { fetchImpl: fn, sleepMs: c.sleepMs, now: c.now });
    expect(out).toMatchObject({ ok: false, retryable: false, code: "CONTAINER_ERROR", containerId: "c1" });
    expect((out as { message: string }).message).toContain("ERROR: Error: Media upload has failed with error code 2207052");
  });

  it("other rejections at publish stay permanent (a real error is not retried)", async () => {
    const { fn } = mockFetch([
      headOk(),
      json({ id: "ig1" }),
      json({ id: "c1" }),
      json({ status_code: "FINISHED" }),
      json({ error: { message: "Invalid image aspect ratio", code: 36003 } }, 400),
    ]);
    const c = clock();
    const out = await publishInstagramPost(PHOTO, { fetchImpl: fn, sleepMs: c.sleepMs, now: c.now });
    expect(out).toMatchObject({ ok: false, retryable: false, code: "REJECTED" });
    expect(c.sleeps).toEqual([]);
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
