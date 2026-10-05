import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { insertDraft, insertSlot, insertTopic, newTest } from "../src/test-utils/convex";

const IG = "https://graph.instagram.com/v26.0";
const MEDIA_URL = "https://files.example.test/photo.png";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function setup(t: ReturnType<typeof newTest>) {
  await t.run(async (ctx) =>
    ctx.db.insert("connections", {
      platform: "instagram",
      platformUserId: "ig1",
      handle: "@me",
      accessToken: "tok",
      tokenExpiresAt: Date.now() + 40 * 86400000,
      scopes: [],
      status: "healthy",
      lastCheckedAt: Date.now(),
    })
  );
  const topic = await insertTopic(t);
  const draft = await insertDraft(t, topic, "instagram", "A caption for the photo.", "ig-caption-beats");
  const asset = await t.run(async (ctx) =>
    ctx.db.insert("mediaAssets", {
      storageId: `external:${MEDIA_URL}`,
      publicUrl: MEDIA_URL,
      mimeType: "image/png",
      verifiedAt: Date.now(),
      createdAt: Date.now(),
    })
  );
  await t.run(async (ctx) => ctx.db.patch(draft, { mediaAssetId: asset }));
  const slot = await insertSlot(t, draft, Date.now() - 60_000, { platform: "instagram" });
  return { slot };
}

/** A fake Instagram API. `notReadyFor` publish calls fail with "Media ID is not available" first. */
function fakeInstagram(opts: { notReadyFor?: number } = {}) {
  let created = 0;
  let publishCalls = 0;
  const published: string[] = [];
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (url === MEDIA_URL) return new Response(null, { status: 200 });
    if (method === "GET" && url.startsWith(`${IG}/ig1?fields=id`)) return new Response(JSON.stringify({ id: "ig1" }), { status: 200 });
    if (method === "POST" && url === `${IG}/ig1/media`) {
      created += 1;
      return new Response(JSON.stringify({ id: `c${created}` }), { status: 200 });
    }
    if (method === "GET" && url.includes("fields=status_code")) return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
    if (method === "POST" && url === `${IG}/ig1/media_publish`) {
      publishCalls += 1;
      if (publishCalls <= (opts.notReadyFor ?? 0)) {
        return new Response(JSON.stringify({ error: { message: "Media ID is not available", code: 9007, error_subcode: 2207027 } }), { status: 400 });
      }
      const body = JSON.parse(String(init?.body));
      published.push(body.creation_id);
      return new Response(JSON.stringify({ id: `m${published.length}` }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  return { impl, published, containersCreated: () => created, publishCalls: () => publishCalls };
}

describe("Instagram photo through the publisher tick", () => {
  it("publishes a photo after one 'Media ID is not available', once, on the same container", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    vi.stubEnv("INSTAGRAM_RETRY_DELAYS_MS", "1,1,1");
    const fake = fakeInstagram({ notReadyFor: 1 });
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    const { slot } = await setup(t);

    await t.action(internal.publish.tick, {});

    const row = await t.run(async (ctx) => ctx.db.get(slot));
    expect(row?.status).toBe("published");
    expect(fake.published).toEqual(["c1"]);
    expect(fake.containersCreated()).toBe(1); // the retry reused the container
    expect(fake.publishCalls()).toBe(2);
    const receipts = await t.query(api.publishLog.attempts, {});
    expect(receipts.some((r) => r.platform === "instagram" && r.outcome === "success")).toBe(true);
  });

  it("when it never becomes ready, the slot goes back to scheduled with its container instead of failing for good", async () => {
    vi.stubEnv("PUBLISH_DRY_RUN", "0");
    vi.stubEnv("INSTAGRAM_RETRY_DELAYS_MS", "1,1,1");
    const fake = fakeInstagram({ notReadyFor: 99 });
    vi.stubGlobal("fetch", fake.impl);
    const t = newTest();
    const { slot } = await setup(t);

    await t.action(internal.publish.tick, {});

    const row = await t.run(async (ctx) => ctx.db.get(slot));
    expect(row?.status).toBe("scheduled");
    expect(row?.attempts).toBe(1);
    expect(row?.containerId).toBe("c1");
    expect(fake.published).toEqual([]);
    const receipts = await t.query(api.publishLog.attempts, {});
    const last = receipts.find((r) => r.platform === "instagram");
    expect(last?.outcome).toBe("retryable");
    expect(last?.providerMessage).toContain("Media ID is not available (code 9007, subcode 2207027)");
  });
});
