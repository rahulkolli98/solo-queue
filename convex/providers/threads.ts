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
 * Network and clock are injected so unit tests can run the whole matrix on
 * mocked responses with a manual clock — no sleeping, no network.
 */

export type ThreadsMediaType = "TEXT" | "IMAGE" | "VIDEO";

export interface ThreadsPostInput {
  userId: string;
  accessToken: string;
  text: string;
  mediaType: ThreadsMediaType;
  /** Publicly reachable URL for IMAGE/VIDEO posts. */
  mediaUrl?: string;
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
    if (typeof nm === "string" && nm) return nm;
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
    } catch (err) {
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

  if (input.mediaType !== "TEXT" && !input.mediaUrl) {
    return {
      ok: false,
      retryable: false,
      code: "NO_MEDIA",
      message: "Media post needs a public media URL.",
    };
  }

  const createBody: Record<string, string> = {
    media_type: input.mediaType,
    text: input.text,
    access_token: input.accessToken,
  };
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
