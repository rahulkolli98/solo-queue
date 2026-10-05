import type { ThreadsOutcome } from "../providers/threads";

/**
 * Pauses between attempts at one reply in a thread. Threads can briefly answer
 * "The requested resource does not exist" for a post or container it created a
 * moment ago, so a reply that fails that way is tried again a few times, with
 * longer waits, before the chain is declared stopped.
 */
export const REPLY_RETRY_DELAYS_MS = [4_000, 10_000, 20_000];

/** Failures worth another try. A rejected login or a media problem is not. */
export function shouldRetryReply(out: ThreadsOutcome): boolean {
  if (out.ok) return false;
  if (out.code === "AUTH" || out.code === "NO_MEDIA" || out.code === "CONTAINER_ERROR") return false;
  return out.retryable || out.code === "POLL_TIMEOUT" || /does not exist|not found|try again|temporar/i.test(out.message);
}

/**
 * Publish one reply, retrying a transient failure. If a container was already
 * created it is resumed (published again by id) instead of creating another,
 * so a retry can never post the same reply twice.
 */
export async function publishReplyWithRetry(args: {
  publish: () => Promise<ThreadsOutcome>;
  resume: (containerId: string) => Promise<ThreadsOutcome>;
  sleep: (ms: number) => Promise<void>;
  delays?: number[];
}): Promise<{ out: ThreadsOutcome; attempts: number }> {
  const delays = args.delays ?? REPLY_RETRY_DELAYS_MS;
  let out = await args.publish();
  let attempts = 1;
  let containerId = !out.ok ? out.containerId : undefined;
  for (const delay of delays) {
    if (out.ok || !shouldRetryReply(out)) break;
    await args.sleep(delay);
    attempts += 1;
    out = containerId ? await args.resume(containerId) : await args.publish();
    if (!out.ok && out.containerId) containerId = out.containerId;
  }
  return { out, attempts };
}
