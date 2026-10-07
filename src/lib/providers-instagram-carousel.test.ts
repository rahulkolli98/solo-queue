import { describe, expect, it } from "vitest";
import {
  publishInstagramPost,
  resumeInstagramContainer,
  type InstagramPostInput,
} from "../../convex/providers/instagram";

type Call = { url: string; method: string; body?: Record<string, string> };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * A pretend Instagram that answers by URL, so the test reads as the story of a post: each child container gets
 * an id (child-1, child-2, ...), the parent is "parent", and `statusOf` says what each container reports.
 */
function pretendInstagram(opts: { statusOf?: (id: string) => Record<string, unknown>; createFails?: number; unreachable?: string } = {}) {
  const calls: Call[] = [];
  let children = 0;
  const fn = (async (url: unknown, init?: { method?: string; body?: string }) => {
    const u = String(url);
    const body = init?.body ? (JSON.parse(init.body) as Record<string, string>) : undefined;
    calls.push({ url: u, method: init?.method ?? "GET", body });
    if (u.startsWith("https://x.test/")) return opts.unreachable && u.includes(opts.unreachable) ? new Response(null, { status: 404 }) : new Response(null, { status: 200 });
    if (u.includes("fields=id,username")) return json({ id: "ig1" });
    if (u.includes("media_publish")) return json({ id: "post-1" });
    if (u.includes("status_code")) {
      const id = /graph\.instagram\.com\/v[\d.]+\/([^?]+)\?/.exec(u)?.[1] ?? "";
      return json(opts.statusOf ? opts.statusOf(id) : { status_code: "FINISHED" });
    }
    if (u.endsWith("/media") && init?.method === "POST") {
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

const slides = (n: number, mimeType = "image/png") =>
  Array.from({ length: n }, (_, i) => ({ url: `https://x.test/slide-${i + 1}.png`, mimeType }));

const CAROUSEL = (n = 3): InstagramPostInput => ({
  igUserId: "ig1",
  accessToken: "tok",
  caption: "The caption",
  mediaUrl: "https://x.test/slide-1.png",
  mimeType: "image/png",
  kind: "carousel",
  mediaItems: slides(n),
});

describe("publishInstagramPost: carousel", () => {
  it("makes one child per image in order, then a parent with the children and the caption, then publishes the parent", async () => {
    const ig = pretendInstagram();
    const out = await publishInstagramPost(CAROUSEL(3), { fetchImpl: ig.fn, ...noSleep });
    expect(out.ok).toBe(true);
    const creates = ig.calls.filter((c) => c.method === "POST" && c.url.endsWith("/media"));
    expect(creates).toHaveLength(4);
    expect(creates.slice(0, 3).map((c) => c.body?.image_url)).toEqual([
      "https://x.test/slide-1.png",
      "https://x.test/slide-2.png",
      "https://x.test/slide-3.png",
    ]);
    expect(creates.slice(0, 3).every((c) => c.body?.is_carousel_item === "true")).toBe(true);
    // Children carry no caption; the parent carries it and lists the children in order.
    expect(creates[0].body?.caption).toBeUndefined();
    expect(creates[3].body).toMatchObject({ media_type: "CAROUSEL", children: "child-1,child-2,child-3", caption: "The caption" });
    const publish = ig.calls.find((c) => c.url.includes("media_publish"));
    expect(publish?.body).toMatchObject({ creation_id: "parent" });
    // Nothing is published before every child and the parent were checked.
    const lastPoll = ig.calls.map((c) => c.url).lastIndexOf(ig.calls.filter((c) => c.url.includes("status_code")).at(-1)!.url);
    expect(ig.calls.indexOf(publish!)).toBeGreaterThan(lastPoll);
  });

  it("checks every image is reachable first, names the slide that is not, and creates nothing", async () => {
    const ig = pretendInstagram({ unreachable: "slide-2" });
    const out = await publishInstagramPost(CAROUSEL(3), { fetchImpl: ig.fn, ...noSleep });
    expect(out).toMatchObject({ ok: false, retryable: false, code: "MEDIA_UNREACHABLE" });
    expect(!out.ok && out.message).toMatch(/Slide 2/);
    expect(ig.calls.some((c) => c.url.endsWith("/media"))).toBe(false);
  });

  it("refuses fewer than 2 or more than 10 images and a non-image file before any network call", async () => {
    for (const n of [0, 1, 11]) {
      const ig = pretendInstagram();
      const out = await publishInstagramPost(CAROUSEL(n), { fetchImpl: ig.fn, ...noSleep });
      expect(out, String(n)).toMatchObject({ ok: false, retryable: false, code: "CAROUSEL_SIZE" });
      expect(ig.calls).toHaveLength(0);
    }
    const ig = pretendInstagram();
    const gif = await publishInstagramPost({ ...CAROUSEL(3), mediaItems: [...slides(2), { url: "https://x.test/a.gif", mimeType: "image/gif" }] }, { fetchImpl: ig.fn, ...noSleep });
    expect(gif).toMatchObject({ ok: false, code: "UNSUPPORTED_FORMAT" });
    expect(!gif.ok && gif.message).toMatch(/slide 3/);
    expect(ig.calls).toHaveLength(0);
  });

  it("a slide Instagram rejects at creation is permanent and names the slide, with no parent made", async () => {
    const ig = pretendInstagram({ createFails: 2 });
    const out = await publishInstagramPost(CAROUSEL(3), { fetchImpl: ig.fn, ...noSleep });
    expect(out).toMatchObject({ ok: false, retryable: false, code: "REJECTED" });
    expect(!out.ok && out.message).toMatch(/^Slide 2:/);
    expect(ig.calls.some((c) => c.body?.media_type === "CAROUSEL")).toBe(false);
  });

  it("a child that ends in ERROR says which slide and why (for example PNG not accepted)", async () => {
    const ig = pretendInstagram({ statusOf: (id) => (id === "child-2" ? { status_code: "ERROR", status: "Unsupported image" } : { status_code: "FINISHED" }) });
    const out = await publishInstagramPost(CAROUSEL(3), { fetchImpl: ig.fn, ...noSleep });
    expect(out).toMatchObject({ ok: false, retryable: false, code: "CONTAINER_ERROR" });
    expect(!out.ok && out.message).toMatch(/slide 2.*Unsupported image/);
    expect(ig.calls.some((c) => c.url.includes("media_publish"))).toBe(false);
  });

  it("a child still processing after the wait is retryable (a retry makes the children again)", async () => {
    let t = 0;
    const ig = pretendInstagram({ statusOf: () => ({ status_code: "IN_PROGRESS" }) });
    const out = await publishInstagramPost(CAROUSEL(2), {
      fetchImpl: ig.fn,
      sleepMs: async (ms) => {
        t += ms;
      },
      now: () => t,
    });
    expect(out).toMatchObject({ ok: false, retryable: true, code: "POLL_TIMEOUT" });
    expect(!out.ok && out.containerId).toBeUndefined();
  });

  it("a parent still processing is handed back with its id so the next tick resumes it, not recreates it", async () => {
    let t = 0;
    const ig = pretendInstagram({ statusOf: (id) => (id === "parent" ? { status_code: "IN_PROGRESS" } : { status_code: "FINISHED" }) });
    const out = await publishInstagramPost(CAROUSEL(2), {
      fetchImpl: ig.fn,
      sleepMs: async (ms) => {
        t += ms;
      },
      now: () => t,
    });
    expect(out).toMatchObject({ ok: false, retryable: true, code: "POLL_TIMEOUT", containerId: "parent" });
    const resumed = await resumeInstagramContainer({ igUserId: "ig1", accessToken: "tok", containerId: "parent" }, { fetchImpl: pretendInstagram().fn, ...noSleep });
    expect(resumed.ok).toBe(true);
  });

  it("a rejected publish of the parent keeps its container id for resume", async () => {
    const ig = pretendInstagram();
    const base = ig.fn;
    const fn = (async (url: unknown, init?: { method?: string; body?: string }) =>
      String(url).includes("media_publish") ? json({ error: { message: "Something else" } }, 400) : base(url as never, init as never)) as typeof fetch;
    const out = await publishInstagramPost(CAROUSEL(2), { fetchImpl: fn, ...noSleep });
    expect(out).toMatchObject({ ok: false, retryable: false, containerId: "parent" });
  });
});
