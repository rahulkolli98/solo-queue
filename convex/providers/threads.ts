/**
 * Threads provider module — pure HTTP against graph.threads.com, no ctx.db.
 *
 * Uses the explicit two-step flow proven in Phase 1 (create container →
 * poll status → publish) for both text and media. Text containers resolve
 * near-instantly, which surfaces as `via: "fast"`; media waits through the
 * ~30s processing gap with a 5-minute backoff cap. (Deliberately not using
 * an auto-publish shortcut: the create endpoint returns a bare `{id}` either
 * way, so a shortcut would make container ids and media ids
 * indistinguishable downstream.)
 *
 * A carousel (2 to 20 images or videos) is one child container per item
 * (`is_carousel_item`), then one parent container (`CAROUSEL` with the child
 * ids and an optional text), then the same poll and publish. It counts as one
 * post against the daily limit.
 *
 * Network and clock are injected so unit tests can run the whole matrix on
 * mocked responses with a manual clock — no sleeping, no network.
 */

import { checkReachable } from "../lib/http";

export type ThreadsMediaType = "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL";

/** A Threads carousel holds 2 to 20 items (Threads' own limits). */
export const CAROUSEL_MIN = 2;
export const CAROUSEL_MAX = 20;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/quicktime"]);

export interface ThreadsPostInput {
  userId: string;
  accessToken: string;
  text: string;
  mediaType: ThreadsMediaType;
  /** Publicly reachable URL for IMAGE/VIDEO posts. */
  mediaUrl?: string;
  /** The file's media type; when given, an image or video Threads cannot take is refused before anything is created. */
  mimeType?: string;
  /** The items of a CAROUSEL, in order. */
  mediaItems?: { url: string; mimeType: string }[];
  /** Media id of the post this one replies to (thread chaining). */
  replyToId?: string;
}

export type ThreadsOutcome =
  | { ok: true; mediaId: string; via: "fast" | "polled" }
  | {
      ok: false;
      retryable: boolean;
      code: string;
      message: string;
      /** Present when a container exists but publishing didn't finish — resume it instead of recreating. */
      containerId?: string;
    };

export interface ThreadsDeps {
  fetchImpl?: typeof fetch;
  sleepMs?: (ms: number) => Promise<void>;
  now?: () => number;
}

export const THREADS_API = "https://graph.threads.com/v1.0";
export const POLL_INTERVAL_MS = 5000;
export const TEXT_POLL_TIMEOUT_MS = 60_000;
export const MEDIA_POLL_TIMEOUT_MS = 5 * 60_000;

type Json = Record<string, unknown>;

function errMessage(data: Json | null, status: number): string {
  const m = data?.["error_message"];
  if (typeof m === "string" && m) return m;
  const nested = data?.["error"];
  if (nested && typeof nested === "object") {
    const nm = (nested as Json)["message"];
    if (typeof nm === "string" && nm) {
      const code = (nested as Json)["code"];
      const sub = (nested as Json)["error_subcode"];
      const tag = [code !== undefined ? `code ${String(code)}` : "", sub !== undefined ? `subcode ${String(sub)}` : ""]
        .filter(Boolean)
        .join(", ");
      return tag ? `${nm} (${tag})` : nm;
    }
  }
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
): Extract<ThreadsOutcome, { ok: false }> {
  if (status === 401 || status === 403) {
    return {
      ok: false,
      retryable: false,
      code: "AUTH",
      message: `Threads auth rejected ${what} — reconnect the account.`,
    };
  }
  const retryable = status === 429 || status >= 500;
  return {
    ok: false,
    retryable,
    code: retryable ? "TRANSIENT" : "REJECTED",
    message: `Threads ${what} failed: ${errMessage(data, status)}`,
  };
}

interface SettleResult {
  settled: boolean; // container FINISHED (or text fast-break) — safe to publish
  waited: boolean; // any sleep happened (drives via fast|polled)
  terminal?: string; // container hit ERROR/EXPIRED — do not publish
  timedOut: boolean;
}

async function pollContainer(
  containerId: string,
  accessToken: string,
  timeoutMs: number,
  dep: Required<Pick<ThreadsDeps, "fetchImpl" | "sleepMs" | "now">>
): Promise<SettleResult> {
  const deadline = dep.now() + timeoutMs;
  let waited = false;
  for (;;) {
    let data: Json | null;
    try {
      const res = await dep.fetchImpl(
        `${THREADS_API}/${containerId}?fields=status,error_message&access_token=${encodeURIComponent(accessToken)}`
      );
      data = await readJson(res);
    } catch {
      // A single failed status read shouldn't kill the publish — if we're
      // out of budget the timeout path below handles it.
      if (dep.now() > deadline) return { settled: false, waited, timedOut: true };
      waited = true;
      await dep.sleepMs(POLL_INTERVAL_MS);
      continue;
    }
    const s = String(data?.["status"] ?? "").toUpperCase();
    if (s.includes("ERROR") || s.includes("EXPIRED")) {
      const em = data?.["error_message"];
      return {
        settled: false,
        waited,
        terminal: typeof em === "string" && em ? em : s,
        timedOut: false,
      };
    }
    if (s.includes("FINISH") || s === "READY" || s === "OK") {
      return { settled: true, waited, timedOut: false };
    }
    if (dep.now() > deadline) return { settled: false, waited, timedOut: true };
    waited = true;
    await dep.sleepMs(POLL_INTERVAL_MS);
  }
}

async function publishContainer(
  userId: string,
  accessToken: string,
  containerId: string,
  fetchImpl: typeof fetch
): Promise<ThreadsOutcome> {
  let res: Response;
  try {
    res = await fetchImpl(`${THREADS_API}/${userId}/threads_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerId, access_token: accessToken }),
    });
  } catch (err) {
    return {
      ok: false,
      retryable: true,
      code: "NETWORK",
      message: `Threads publish network error: ${err instanceof Error ? err.message : "unknown"}.`,
      containerId,
    };
  }
  const data = await readJson(res);
  const id = data?.["id"];
  if (!res.ok || typeof id !== "string" || !id) {
    return {
      ...httpOutcome(data, res.status, "publish"),
      containerId,
    };
  }
  return { ok: true, mediaId: id, via: "polled" };
}

type ContainerResult = { ok: true; id: string } | { ok: false; outcome: Extract<ThreadsOutcome, { ok: false }> };

/** POST /{user}/threads: one container (a post, a carousel child or a carousel parent). */
async function createContainer(userId: string, body: Record<string, string>, fetchImpl: typeof fetch): Promise<ContainerResult> {
  let res: Response;
  try {
    res = await fetchImpl(`${THREADS_API}/${userId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      ok: false,
      outcome: {
        ok: false,
        retryable: true,
        code: "NETWORK",
        message: `Threads container network error: ${err instanceof Error ? err.message : "unknown"}.`,
      },
    };
  }
  const data = await readJson(res);
  const id = data?.["id"];
  if (!res.ok || typeof id !== "string" || !id) return { ok: false, outcome: httpOutcome(data, res.status, "container") };
  return { ok: true, id };
}

const isVideo = (mimeType: string) => VIDEO_MIMES.has(mimeType.toLowerCase());

/** The reason a carousel's items cannot be posted, or null when there are 2 to 20 JPEG, PNG, MP4 or MOV items. */
function carouselProblem(items: ThreadsPostInput["mediaItems"]): Extract<ThreadsOutcome, { ok: false }> | null {
  const list = items ?? [];
  if (list.length < CAROUSEL_MIN || list.length > CAROUSEL_MAX) {
    return {
      ok: false,
      retryable: false,
      code: "CAROUSEL_SIZE",
      message: `A Threads carousel needs ${CAROUSEL_MIN} to ${CAROUSEL_MAX} images or videos — this one has ${list.length}.`,
    };
  }
  const odd = list.findIndex((m) => !IMAGE_MIMES.has(m.mimeType.toLowerCase()) && !VIDEO_MIMES.has(m.mimeType.toLowerCase()));
  if (odd !== -1) {
    return {
      ok: false,
      retryable: false,
      code: "UNSUPPORTED_FORMAT",
      message: `Threads carousel items need JPEG, PNG, MP4 or MOV — item ${odd + 1} is ${list[odd].mimeType}.`,
    };
  }
  if (list.some((m) => !m.url)) {
    return { ok: false, retryable: false, code: "NO_MEDIA", message: "Every carousel item needs a public URL." };
  }
  return null;
}

/**
 * One child container per item, in order, each waited on until Threads has finished it (a child that errors
 * names its item). Children are not resumable: a retry makes them again.
 */
async function createCarouselChildren(
  input: ThreadsPostInput,
  dep: Required<Pick<ThreadsDeps, "fetchImpl" | "sleepMs" | "now">>
): Promise<{ ok: true; ids: string[] } | { ok: false; outcome: Extract<ThreadsOutcome, { ok: false }> }> {
  const ids: string[] = [];
  for (const [i, item] of (input.mediaItems ?? []).entries()) {
    const video = isVideo(item.mimeType);
    const made = await createContainer(
      input.userId,
      {
        media_type: video ? "VIDEO" : "IMAGE",
        [video ? "video_url" : "image_url"]: item.url,
        is_carousel_item: "true",
        access_token: input.accessToken,
      },
      dep.fetchImpl
    );
    if (!made.ok) return { ok: false, outcome: { ...made.outcome, message: `Item ${i + 1}: ${made.outcome.message}` } };
    ids.push(made.id);
  }
  for (const [i, id] of ids.entries()) {
    const poll = await pollContainer(id, input.accessToken, MEDIA_POLL_TIMEOUT_MS, dep);
    if (poll.terminal) {
      return {
        ok: false,
        outcome: { ok: false, retryable: false, code: "CONTAINER_ERROR", message: `Threads rejected item ${i + 1}: ${poll.terminal}` },
      };
    }
    if (poll.timedOut) {
      return {
        ok: false,
        outcome: { ok: false, retryable: true, code: "POLL_TIMEOUT", message: `Threads is still processing item ${i + 1} — will try again.` },
      };
    }
  }
  return { ok: true, ids };
}

/** Check, before anything is created, that every URL can be fetched. */
async function unreachable(urls: string[], fetchImpl: typeof fetch, label: (i: number) => string): Promise<Extract<ThreadsOutcome, { ok: false }> | null> {
  for (let i = 0; i < urls.length; i += 1) {
    try {
      await checkReachable(urls[i], fetchImpl);
    } catch (err) {
      const why = err instanceof Error ? err.message : "Media URL is unreachable.";
      return { ok: false, retryable: false, code: "MEDIA_UNREACHABLE", message: `${label(i)}${why}` };
    }
  }
  return null;
}

/**
 * Publish one post. For IMAGE/VIDEO the caller passes the post's public
 * mediaUrl; the container id is returned on timeout so the tick can resume
 * polling instead of creating a duplicate.
 */
export async function publishThreadsPost(
  input: ThreadsPostInput,
  deps: ThreadsDeps = {}
): Promise<ThreadsOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleepMs = deps.sleepMs ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const dep = { fetchImpl, sleepMs, now };

  if (input.mediaType === "CAROUSEL") {
    const bad = carouselProblem(input.mediaItems);
    if (bad) return bad;
    const gone = await unreachable((input.mediaItems ?? []).map((m) => m.url), fetchImpl, (i) => `Item ${i + 1}: `);
    if (gone) return gone;
  } else if (input.mediaType !== "TEXT") {
    if (!input.mediaUrl) {
      return {
        ok: false,
        retryable: false,
        code: "NO_MEDIA",
        message: "Media post needs a public media URL.",
      };
    }
    const allowed = input.mediaType === "VIDEO" ? VIDEO_MIMES : IMAGE_MIMES;
    if (input.mimeType && !allowed.has(input.mimeType.toLowerCase())) {
      return {
        ok: false,
        retryable: false,
        code: "UNSUPPORTED_FORMAT",
        message: `Threads ${input.mediaType === "VIDEO" ? "videos need MP4 or MOV" : "images need JPEG or PNG"} — got ${input.mimeType}.`,
      };
    }
    const gone = await unreachable([input.mediaUrl], fetchImpl, () => "");
    if (gone) return gone;
  }

  let children: string[] | undefined;
  if (input.mediaType === "CAROUSEL") {
    const made = await createCarouselChildren(input, dep);
    if (!made.ok) return made.outcome;
    children = made.ids;
  }

  const createBody: Record<string, string> = {
    media_type: input.mediaType,
    access_token: input.accessToken,
  };
  // A carousel's text is optional; a text, image or video post always has some.
  if (input.mediaType !== "CAROUSEL" || input.text) createBody["text"] = input.text;
  if (children) createBody["children"] = children.join(",");
  if (input.replyToId) createBody["reply_to_id"] = input.replyToId;
  if (input.mediaType === "IMAGE" && input.mediaUrl) createBody["image_url"] = input.mediaUrl;
  if (input.mediaType === "VIDEO" && input.mediaUrl) createBody["video_url"] = input.mediaUrl;

  let createRes: Response;
  try {
    createRes = await fetchImpl(`${THREADS_API}/${input.userId}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createBody),
    });
  } catch (err) {
    return {
      ok: false,
      retryable: true,
      code: "NETWORK",
      message: `Threads container network error: ${err instanceof Error ? err.message : "unknown"}.`,
    };
  }
  const created = await readJson(createRes);
  const containerId = created?.["id"];
  if (!createRes.ok || typeof containerId !== "string" || !containerId) {
    return httpOutcome(created, createRes.status, "container");
  }

  const timeoutMs = input.mediaType === "TEXT" ? TEXT_POLL_TIMEOUT_MS : MEDIA_POLL_TIMEOUT_MS;
  const poll = await pollContainer(containerId, input.accessToken, timeoutMs, dep);
  if (poll.terminal) {
    return {
      ok: false,
      retryable: false,
      code: "CONTAINER_ERROR",
      message: `Threads container failed: ${poll.terminal}`,
      containerId,
    };
  }
  if (poll.timedOut) {
    // Text containers are near-instant — the proven Phase 1 behavior is to
    // attempt publish on timeout. Media may still be processing: don't
    // publish blind, hand the container back for resume.
    if (input.mediaType === "TEXT") {
      const pub = await publishContainer(input.userId, input.accessToken, containerId, fetchImpl);
      return pub;
    }
    return {
      ok: false,
      retryable: true,
      code: "POLL_TIMEOUT",
      message: "Threads media still processing after 5 minutes — will resume.",
      containerId,
    };
  }
  const pub = await publishContainer(input.userId, input.accessToken, containerId, fetchImpl);
  if (pub.ok && !poll.waited) return { ok: true, mediaId: pub.mediaId, via: "fast" };
  return pub;
}

/**
 * Resume a container left behind by a POLL_TIMEOUT (or a crashed tick):
 * poll the existing container with a fresh budget, then publish.
 */
export async function resumeThreadsContainer(
  args: { userId: string; accessToken: string; containerId: string; mediaType: ThreadsMediaType },
  deps: ThreadsDeps = {}
): Promise<ThreadsOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleepMs = deps.sleepMs ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const timeoutMs = args.mediaType === "TEXT" ? TEXT_POLL_TIMEOUT_MS : MEDIA_POLL_TIMEOUT_MS;
  const poll = await pollContainer(args.containerId, args.accessToken, timeoutMs, {
    fetchImpl,
    sleepMs,
    now,
  });
  if (poll.terminal) {
    return {
      ok: false,
      retryable: false,
      code: "CONTAINER_ERROR",
      message: `Threads container failed: ${poll.terminal}`,
      containerId: args.containerId,
    };
  }
  if (poll.timedOut) {
    return {
      ok: false,
      retryable: true,
      code: "POLL_TIMEOUT",
      message: "Threads container still not ready — will retry.",
      containerId: args.containerId,
    };
  }
  const pub = await publishContainer(args.userId, args.accessToken, args.containerId, fetchImpl);
  if (pub.ok && !poll.waited) return { ok: true, mediaId: pub.mediaId, via: "fast" };
  return pub;
}
