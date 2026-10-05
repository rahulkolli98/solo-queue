/**
 * Instagram provider module — pure HTTP, no ctx.db. Mirrors the Threads
 * provider's shape (typed outcomes, injected fetch/clock, resume support).
 *
 * Uses the same graph.instagram.com versioned endpoint our connection proof
 * talks to. Photos publish immediately after container creation; reels wait
 * through video processing (5-minute cap, then resume-by-container).
 *
 * Pre-flight order is deliberate: format → reachability → identity, so an
 * unreachable-media case returns permanent WITHOUT any publish call.
 */

import { checkReachable } from "../lib/http";

export type InstagramKind = "photo" | "reel";

export interface InstagramPostInput {
  igUserId: string;
  accessToken: string;
  caption: string;
  mediaUrl: string;
  mimeType: string;
  kind: InstagramKind;
}

export type InstagramOutcome =
  | { ok: true; mediaId: string; via: "fast" | "polled" }
  | {
      ok: false;
      retryable: boolean;
      code: string;
      message: string;
      /** Present when a container exists but publishing didn't finish — resume it instead of recreating. */
      containerId?: string;
    };

export interface InstagramDeps {
  fetchImpl?: typeof fetch;
  sleepMs?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const INSTAGRAM_API = "https://graph.instagram.com/v26.0";
export const POLL_INTERVAL_MS = 5000;
export const REEL_POLL_TIMEOUT_MS = 5 * 60_000;
/** A photo is usually ready in seconds; give it a minute before handing the container back to resume. */
export const PHOTO_POLL_TIMEOUT_MS = 60_000;
/** Pauses between publish attempts when Instagram says the container is not ready yet. */
export const NOT_READY_RETRY_MS = [3_000, 6_000, 12_000];
export const CAPTION_LIMIT = 2200;

const PHOTO_MIMES = new Set(["image/jpeg", "image/png"]);
const REEL_MIMES = new Set(["video/mp4", "video/quicktime"]);

type Json = Record<string, unknown>;

function errMessage(data: Json | null, status: number): string {
  const err = data?.["error"];
  if (err && typeof err === "object") {
    const m = (err as Json)["message"];
    if (typeof m === "string" && m) {
      const code = (err as Json)["code"];
      const sub = (err as Json)["error_subcode"];
      const tag = [code !== undefined ? `code ${String(code)}` : "", sub !== undefined ? `subcode ${String(sub)}` : ""]
        .filter(Boolean)
        .join(", ");
      return tag ? `${m} (${tag})` : m;
    }
  }
  const m = data?.["error_message"];
  if (typeof m === "string" && m) return m;
  return `HTTP ${status}`;
}

async function readJson(res: Response): Promise<Json | null> {
  try {
    const data = (await res.json()) as unknown;
    return data && typeof data === "object" ? (data as Json) : null;
  } catch {
    return null;
  }
}

function httpOutcome(
  data: Json | null,
  status: number,
  what: string
): Extract<InstagramOutcome, { ok: false }> {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      retryable: false,
      code: "AUTH",
      message: `Instagram auth rejected ${what} — reconnect the account.`,
    };
  }
  const message = errMessage(data, status);
  // Publishing a container Instagram has not finished preparing answers "Media ID is not available"
  // (or "not ready"): it is a wait, not a rejection.
  if (what === "publish" && NOT_READY.test(message)) {
    return { ok: false, retryable: true, code: "NOT_READY", message: `Instagram ${what} failed: ${message}` };
  }
  const retryable = status === 429 || status >= 500;
  return {
    ok: false,
    retryable,
    code: retryable ? "TRANSIENT" : "REJECTED",
    message: `Instagram ${what} failed: ${message}`,
  };
}

const NOT_READY = /not available|not ready|try again|temporar|does not exist/i;

async function publishContainer(
  igUserId: string,
  accessToken: string,
  containerId: string,
  fetchImpl: typeof fetch
): Promise<InstagramOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${INSTAGRAM_API}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
    });
  } catch (err) {
    return {
      ok: false,
      retryable: true,
      code: "NETWORK",
      message: `Instagram publish network error: ${err instanceof Error ? err.message : "unknown"}.`,
      containerId,
    };
  }
  const data = await readJson(res);
  const id = data?.["id"];
  if (!res.ok || typeof id !== "string" || !id) {
    return { ...httpOutcome(data, res.status, "publish"), containerId };
  }
  return { ok: true, mediaId: id, via: "polled" };
}

/** Test knob: INSTAGRAM_RETRY_DELAYS_MS="1,1,1" shortens the waits. Unset in production. */
function retryDelays(): number[] {
  const raw = typeof process !== "undefined" ? process.env.INSTAGRAM_RETRY_DELAYS_MS : undefined;
  if (!raw) return NOT_READY_RETRY_MS;
  const list = raw.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n >= 0);
  return list.length > 0 ? list : NOT_READY_RETRY_MS;
}

/** media_publish, retried a few times (3 s, 6 s, 12 s) while Instagram says the container is not ready. */
async function publishWhenReady(
  igUserId: string,
  accessToken: string,
  containerId: string,
  fetchImpl: typeof fetch,
  sleepMs: (ms: number) => Promise<void>
): Promise<InstagramOutcome> {
  let out = await publishContainer(igUserId, accessToken, containerId, fetchImpl);
  for (const delay of retryDelays()) {
    if (out.ok || out.code !== "NOT_READY") break;
    await sleepMs(delay);
    out = await publishContainer(igUserId, accessToken, containerId, fetchImpl);
  }
  return out;
}

interface PollResult {
  ready: boolean;
  waited: boolean;
  terminal?: string;
  timedOut: boolean;
}

async function pollReel(
  containerId: string,
  accessToken: string,
  timeoutMs: number,
  dep: Required<Pick<InstagramDeps, "fetchImpl" | "sleepMs" | "now">>
): Promise<PollResult> {
  const deadline = dep.now() + timeoutMs;
  let waited = false;
  for (;;) {
    let data: Json | null;
    try {
      const res = await dep.fetchImpl(
        `${INSTAGRAM_API}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`
      );
      data = await readJson(res);
    } catch {
      if (dep.now() > deadline) return { ready: false, waited, timedOut: true };
      waited = true;
      await dep.sleepMs(POLL_INTERVAL_MS);
      continue;
    }
    const s = String(data?.["status_code"] ?? "").toUpperCase();
    if (s === "ERROR" || s === "EXPIRED") {
      // Instagram explains a container error in `status` (for example an unsupported image format).
      const why = data?.["status"];
      const detail = typeof why === "string" && why.trim() ? `: ${why.trim().slice(0, 200)}` : "";
      return { ready: false, waited, terminal: `${s}${detail}`, timedOut: false };
    }
    if (s === "FINISHED" || s === "PUBLISHED") {
      return { ready: true, waited, timedOut: false };
    }
    if (dep.now() > deadline) return { ready: false, waited, timedOut: true };
    waited = true;
    await dep.sleepMs(POLL_INTERVAL_MS);
  }
}

/**
 * Publish one photo or reel. Pre-flight (format → reachability → identity)
 * runs before any container is created; reachability failure is permanent
 * and never touches the publish endpoint.
 */
export async function publishInstagramPost(
  input: InstagramPostInput,
  deps: InstagramDeps = {}
): Promise<InstagramOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleepMs = deps.sleepMs ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;

  if (input.caption.length > CAPTION_LIMIT) {
    return {
      ok: false,
      retryable: false,
      code: "CAPTION_LONG",
      message: `Caption is ${input.caption.length - CAPTION_LIMIT} chars over the 2,200 limit.`,
    };
  }
  const allowed = input.kind === "photo" ? PHOTO_MIMES : REEL_MIMES;
  if (!allowed.has(input.mimeType.toLowerCase())) {
    return {
      ok: false,
      retryable: false,
      code: "UNSUPPORTED_FORMAT",
      message: `Instagram ${input.kind}s need ${input.kind === "photo" ? "JPEG/PNG" : "MP4"} — got ${input.mimeType}.`,
    };
  }
  if (!input.mediaUrl) {
    return {
      ok: false,
      retryable: false,
      code: "NO_MEDIA",
      message: "Media post needs a public media URL.",
    };
  }

  try {
    await checkReachable(input.mediaUrl, fetchImpl);
  } catch (err) {
    return {
      ok: false,
      retryable: false,
      code: "MEDIA_UNREACHABLE",
      message: err instanceof Error ? err.message : "Media URL is unreachable.",
    };
  }

  // Identity proof: a publishing-capable professional account behind this token.
  // Any failure here is terminal AUTH — the fix is always to reconnect,
  // never to retry the same call.
  try {
    const me = await fetchImpl(
      `${INSTAGRAM_API}/${input.igUserId}?fields=id,username&access_token=${encodeURIComponent(input.accessToken)}`
    );
    const meData = await readJson(me);
    if (!me.ok || !meData?.["id"]) {
      return {
        ok: false,
        retryable: false,
        code: "AUTH",
        message: `Instagram identity check failed — reconnect the account: ${errMessage(meData, me.status)}`,
      };
    }
  } catch (err) {
    return {
      ok: false,
      retryable: true,
      code: "NETWORK",
      message: `Instagram identity network error: ${err instanceof Error ? err.message : "unknown"}.`,
    };
  }

  const createBody: Record<string, string> =
    input.kind === "photo"
      ? { image_url: input.mediaUrl, caption: input.caption, access_token: input.accessToken }
      : {
          media_type: "REELS",
          video_url: input.mediaUrl,
          caption: input.caption,
          access_token: input.accessToken,
        };
  let createRes: Response;
  try {
    createRes = await fetchImpl(`${INSTAGRAM_API}/${input.igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    });
  } catch (err) {
    return {
      ok: false,
      retryable: true,
      code: "NETWORK",
      message: `Instagram container network error: ${err instanceof Error ? err.message : "unknown"}.`,
    };
  }
  const created = await readJson(createRes);
  const containerId = created?.["id"];
  if (!createRes.ok || typeof containerId !== "string" || !containerId) {
    return httpOutcome(created, createRes.status, "container");
  }

  // Photos and reels both wait for the container to be FINISHED before publishing.
  // (Publishing a photo straight after creating it failed on the first live run with
  // "Media ID is not available".)
  const poll = await pollReel(
    containerId,
    input.accessToken,
    input.kind === "photo" ? PHOTO_POLL_TIMEOUT_MS : REEL_POLL_TIMEOUT_MS,
    {
      fetchImpl,
      sleepMs,
      now,
    }
  );
  if (poll.terminal) {
    return {
      ok: false,
      retryable: false,
      code: "CONTAINER_ERROR",
      message: `Instagram container failed: ${poll.terminal}`,
      containerId,
    };
  }
  if (poll.timedOut) {
    return {
      ok: false,
      retryable: true,
      code: "POLL_TIMEOUT",
      message: `Instagram ${input.kind} still processing — will resume.`,
      containerId,
    };
  }
  const pub = await publishWhenReady(input.igUserId, input.accessToken, containerId, fetchImpl, sleepMs);
  if (pub.ok && !poll.waited) return { ok: true, mediaId: pub.mediaId, via: "fast" };
  return pub;
}

/**
 * Resume a reel container left behind by a POLL_TIMEOUT: poll the existing
 * container with a fresh budget, then publish.
 */
export async function resumeInstagramContainer(
  args: { igUserId: string; accessToken: string; containerId: string },
  deps: InstagramDeps = {}
): Promise<InstagramOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleepMs = deps.sleepMs ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const poll = await pollReel(args.containerId, args.accessToken, REEL_POLL_TIMEOUT_MS, {
    fetchImpl,
    sleepMs,
    now,
  });
  if (poll.terminal) {
    return {
      ok: false,
      retryable: false,
      code: "CONTAINER_ERROR",
      message: `Instagram container failed: ${poll.terminal}`,
      containerId: args.containerId,
    };
  }
  if (poll.timedOut) {
    return {
      ok: false,
      retryable: true,
      code: "POLL_TIMEOUT",
      message: "Instagram container still not ready — will retry.",
      containerId: args.containerId,
    };
  }
  const pub = await publishWhenReady(args.igUserId, args.accessToken, args.containerId, fetchImpl, sleepMs);
  if (pub.ok && !poll.waited) return { ok: true, mediaId: pub.mediaId, via: "fast" };
  return pub;
}
