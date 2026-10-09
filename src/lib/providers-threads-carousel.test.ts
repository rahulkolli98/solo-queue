import { describe, expect, it } from "vitest";
import { publishThreadsPost, resumeThreadsContainer, type ThreadsPostInput } from "../../convex/providers/threads";

type Call = { url: string; method: string; body?: Record<string, string> };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * A pretend Threads that answers by URL, so the test reads as the story of a post: each child container gets an
 * id (child-1, child-2, ...), the parent is "parent", and `statusOf` says what each container reports.
 */
function pretendThreads(opts: { statusOf?: (id: string) => Record<string, unknown>; createFails?: number; unreachable?: string } = {}) {
  const calls: Call[] = [];
  let children = 0;
  const fn = (async (url: unknown, init?: { method?: string; body?: string }) => {
    const u = String(url);
    const body = init?.body ? (JSON.parse(init.body) as Record<string, string>) : undefined;
    calls.push({ url: u, method: init?.method ?? "GET", body });
    if (u.startsWith("https://x.test/")) {
      return opts.unreachable && u.includes(opts.unreachable) ? new Response(null, { status: 404 }) : new Response(null, { status: 200 });
    }
    if (u.includes("threads_publish")) return json({ id: "post-1" });
    if (u.includes("fields=status")) {
      const id = /graph\.threads\.com\/v[\d.]+\/([^?]+)\?/.exec(u)?.[1] ?? "";
      return json(opts.statusOf ? opts.statusOf(id) : { status: "FINISHED" });
    }
    if (u.endsWith("/u1/threads") && init?.method === "POST") {
      if (body?.is_carousel_item) {
        children += 1;
        if (opts.createFails === children) return json({ error: { message: "Invalid image", code: 9004 } }, 400);
        return json({ id: `child-${children}` });
      }
      return json({ id: "parent" });
    }
    return json({}, 404);
  }) as typeof fetch;
  return { fn, calls };
}

const noSleep = { sleepMs: async () => {}, now: () => 0 };
const items = (n: number, mimeType = "image/png") =>
  Array.from({ length: n }, (_, i) => ({ url: `https://x.test/slide-${i + 1}.png`, mimeType }));
const CAROUSEL = (n = 3, text = "The Threads text"): ThreadsPostInput => ({
  userId: "u1",
  accessToken: "tok",
  text,
  mediaType: "CAROUSEL",
  mediaItems: items(n),
});
const creates = (calls: Call[]) => calls.filter((c) => c.method === "POST" && c.url.endsWith("/u1/threads"));

describe("publishThreadsPost: carousel", () => {
  it("makes one child per item in order, then a parent with the children and the text, then publishes the parent", async () => {
    const th = pretendThreads();
    const out = await publishThreadsPost(CAROUSEL(3), { fetchImpl: th.fn, ...noSleep });
    expect(out.ok).toBe(true);
    const made = creates(th.calls);
    expect(made).toHaveLength(4);
    expect(made.slice(0, 3).map((c) => c.body?.image_url)).toEqual([
      "https://x.test/slide-1.png",
      "https://x.test/slide-2.png",
      "https://x.test/slide-3.png",
    ]);
    expect(made.slice(0, 3).every((c) => c.body?.is_carousel_item === "true" && c.body?.media_type === "IMAGE")).toBe(true);
    // Children carry no text; the parent carries it and lists the children in order.
    expect(made[0].body?.text).toBeUndefined();
    expect(made[3].body).toMatchObject({ media_type: "CAROUSEL", children: "child-1,child-2,child-3", text: "The Threads text" });
    const publish = th.calls.find((c) => c.url.includes("threads_publish"));
    expect(publish?.body).toMatchObject({ creation_id: "parent" });
    // Nothing is published before every child and the parent were checked.
    const statusReads = th.calls.map((c, i) => (c.url.includes("fields=status") ? i : -1)).filter((i) => i >= 0);
    expect(th.calls.indexOf(publish!)).toBeGreaterThan(statusReads.at(-1)!);
    expect(new Set(statusReads.map((i) => th.calls[i].url.match(/v[\d.]+\/([^?]+)/)?.[1]))).toEqual(new Set(["child-1", "child-2", "child-3", "parent"]));
  });

  it("sends a video item as a VIDEO child and lets images and videos mix", async () => {
    const th = pretendThreads();
    const input: ThreadsPostInput = {
      ...CAROUSEL(2),
      mediaItems: [
        { url: "https://x.test/a.png", mimeType: "image/png" },
        { url: "https://x.test/b.mp4", mimeType: "video/mp4" },
      ],
    };
    expect((await publishThreadsPost(input, { fetchImpl: th.fn, ...noSleep })).ok).toBe(true);
    const made = creates(th.calls);
    expect(made[0].body).toMatchObject({ media_type: "IMAGE", image_url: "https://x.test/a.png" });
    expect(made[1].body).toMatchObject({ media_type: "VIDEO", video_url: "https://x.test/b.mp4" });
    expect(made[1].body?.image_url).toBeUndefined();
  });

  it("leaves the text out of the parent when the carousel has none", async () => {
    const th = pretendThreads();
    await publishThreadsPost(CAROUSEL(2, ""), { fetchImpl: th.fn, ...noSleep });
    expect(creates(th.calls).at(-1)?.body).not.toHaveProperty("text");
  });

  it("refuses fewer than 2 or more than 20 items, before any network call", async () => {
    for (const n of [0, 1, 21]) {
      const th = pretendThreads();
      const out = await publishThreadsPost(CAROUSEL(n), { fetchImpl: th.fn, ...noSleep });
      expect(out).toMatchObject({ ok: false, retryable: false, code: "CAROUSEL_SIZE" });
      expect(th.calls).toEqual([]);
    }
  });

  it("refuses a file Threads cannot take, naming the item", async () => {
    const th = pretendThreads();
    const bad = { ...CAROUSEL(3), mediaItems: [...items(2), { url: "https://x.test/c.webp", mimeType: "image/webp" }] };
    const out = await publishThreadsPost(bad, { fetchImpl: th.fn, ...noSleep });
    expect(out).toMatchObject({ ok: false, retryable: false, code: "UNSUPPORTED_FORMAT" });
    expect((out as { message: string }).message).toContain("item 3");
    expect(th.calls).toEqual([]);
  });

  it("checks every item is reachable before making any container, and names the one that is not", async () => {
    const th = pretendThreads({ unreachable: "slide-2" });
    const out = await publishThreadsPost(CAROUSEL(3), { fetchImpl: th.fn, ...noSleep });
    expect(out).toMatchObject({ ok: false, retryable: false, code: "MEDIA_UNREACHABLE" });
    expect((out as { message: string }).message).toContain("Item 2");
    expect(creates(th.calls)).toEqual([]);
  });

  it("names the item Threads rejects and never makes the parent", async () => {
    const th = pretendThreads({ createFails: 2 });
    const out = await publishThreadsPost(CAROUSEL(3), { fetchImpl: th.fn, ...noSleep });
    expect(out).toMatchObject({ ok: false });
    expect((out as { message: string }).message).toContain("Item 2");
    expect(creates(th.calls).some((c) => c.body?.media_type === "CAROUSEL")).toBe(false);
  });

  it("a child that errors while processing stops the post and names its item", async () => {
    const th = pretendThreads({ statusOf: (id) => (id === "child-2" ? { status: "ERROR", error_message: "bad aspect ratio" } : { status: "FINISHED" }) });
    const out = await publishThreadsPost(CAROUSEL(3), { fetchImpl: th.fn, ...noSleep });
    expect(out).toMatchObject({ ok: false, retryable: false, code: "CONTAINER_ERROR" });
    expect((out as { message: string }).message).toContain("item 2");
    expect(th.calls.some((c) => c.url.includes("threads_publish"))).toBe(false);
  });

  it("hands the parent back for resume when it is still processing after the budget", async () => {
    let t = 0;
    const th = pretendThreads({ statusOf: (id) => (id === "parent" ? { status: "IN_PROGRESS" } : { status: "FINISHED" }) });
    const out = await publishThreadsPost(CAROUSEL(2), {
      fetchImpl: th.fn,
      now: () => t,
      sleepMs: async () => {
        t += 10 * 60_000;
      },
    });
    expect(out).toMatchObject({ ok: false, retryable: true, code: "POLL_TIMEOUT", containerId: "parent" });
    expect(th.calls.some((c) => c.url.includes("threads_publish"))).toBe(false);
  });

  it("resumes the parent container with the media budget and publishes it", async () => {
    const th = pretendThreads();
    const out = await resumeThreadsContainer(
      { userId: "u1", accessToken: "tok", containerId: "parent", mediaType: "CAROUSEL" },
      { fetchImpl: th.fn, ...noSleep }
    );
    expect(out).toMatchObject({ ok: true, mediaId: "post-1" });
  });
});

describe("publishThreadsPost: one image or video", () => {
  it("refuses an image Threads cannot take, and a video it cannot take, before any container is made", async () => {
    const th = pretendThreads();
    const png = await publishThreadsPost(
      { userId: "u1", accessToken: "tok", text: "hi", mediaType: "IMAGE", mediaUrl: "https://x.test/a.gif", mimeType: "image/gif" },
      { fetchImpl: th.fn, ...noSleep }
    );
    expect(png).toMatchObject({ ok: false, retryable: false, code: "UNSUPPORTED_FORMAT" });
    const mov = await publishThreadsPost(
      { userId: "u1", accessToken: "tok", text: "hi", mediaType: "VIDEO", mediaUrl: "https://x.test/a.avi", mimeType: "video/x-msvideo" },
      { fetchImpl: th.fn, ...noSleep }
    );
    expect(mov).toMatchObject({ ok: false, code: "UNSUPPORTED_FORMAT" });
    expect(th.calls).toEqual([]);
  });

  it("refuses an unreachable image before making a container", async () => {
    const th = pretendThreads({ unreachable: "gone" });
    const out = await publishThreadsPost(
      { userId: "u1", accessToken: "tok", text: "hi", mediaType: "IMAGE", mediaUrl: "https://x.test/gone.jpg", mimeType: "image/jpeg" },
      { fetchImpl: th.fn, ...noSleep }
    );
    expect(out).toMatchObject({ ok: false, retryable: false, code: "MEDIA_UNREACHABLE" });
    expect(creates(th.calls)).toEqual([]);
  });

  it("posts a JPEG with its text as an IMAGE container", async () => {
    const th = pretendThreads();
    const out = await publishThreadsPost(
      { userId: "u1", accessToken: "tok", text: "hello", mediaType: "IMAGE", mediaUrl: "https://x.test/a.jpg", mimeType: "image/jpeg" },
      { fetchImpl: th.fn, ...noSleep }
    );
    expect(out.ok).toBe(true);
    expect(creates(th.calls)[0].body).toMatchObject({ media_type: "IMAGE", image_url: "https://x.test/a.jpg", text: "hello" });
  });
});
