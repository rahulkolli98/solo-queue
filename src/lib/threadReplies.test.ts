import { describe, expect, it, vi } from "vitest";
import type { ThreadsOutcome } from "../../convex/providers/threads";
import { publishReplyWithRetry, shouldRetryReply } from "../../convex/lib/threadReplies";

const ok: ThreadsOutcome = { ok: true, mediaId: "m", via: "polled" };
const fail = (over: Partial<Extract<ThreadsOutcome, { ok: false }>> = {}): ThreadsOutcome => ({
  ok: false,
  retryable: false,
  code: "REJECTED",
  message: "Threads publish failed: The requested resource does not exist",
  ...over,
});

describe("shouldRetryReply", () => {
  it("retries a 'does not exist' right after creating a post, and ordinary transient failures", () => {
    expect(shouldRetryReply(fail())).toBe(true);
    expect(shouldRetryReply(fail({ retryable: true, code: "TRANSIENT", message: "HTTP 500" }))).toBe(true);
    expect(shouldRetryReply(fail({ code: "POLL_TIMEOUT", retryable: true, message: "still processing" }))).toBe(true);
  });

  it("never retries a rejected login, a broken container, a plain rejection, or success", () => {
    expect(shouldRetryReply(fail({ code: "AUTH", message: "reconnect" }))).toBe(false);
    expect(shouldRetryReply(fail({ code: "CONTAINER_ERROR", message: "Threads container failed: bad" }))).toBe(false);
    expect(shouldRetryReply(fail({ message: "Text is too long" }))).toBe(false);
    expect(shouldRetryReply(ok)).toBe(false);
  });
});

describe("publishReplyWithRetry", () => {
  const sleep = vi.fn(async () => {});

  it("returns at once on success, without waiting", async () => {
    const publish = vi.fn(async () => ok);
    const r = await publishReplyWithRetry({ publish, resume: vi.fn(), sleep, delays: [1, 1] });
    expect(r).toEqual({ out: ok, attempts: 1 });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("resumes the container it already created rather than creating another", async () => {
    const publish = vi.fn(async () => fail({ containerId: "c9" }));
    const resume = vi.fn(async () => ok);
    const r = await publishReplyWithRetry({ publish, resume, sleep, delays: [1, 1] });
    expect(r).toEqual({ out: ok, attempts: 2 });
    expect(resume).toHaveBeenCalledWith("c9");
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("recreates the post when no container existed yet", async () => {
    const publish = vi
      .fn()
      .mockResolvedValueOnce(fail({ message: "Threads container failed: does not exist" }))
      .mockResolvedValueOnce(ok);
    const r = await publishReplyWithRetry({ publish, resume: vi.fn(), sleep, delays: [1] });
    expect(r.out).toEqual(ok);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it("stops after the delays run out and reports the attempts; stops at once on a permanent error", async () => {
    const always = vi.fn(async () => fail({ containerId: "c1" }));
    const resume = vi.fn(async () => fail({ containerId: "c1" }));
    const r = await publishReplyWithRetry({ publish: always, resume, sleep, delays: [1, 1, 1] });
    expect(r.attempts).toBe(4);
    expect(r.out.ok).toBe(false);
    const auth = vi.fn(async () => fail({ code: "AUTH", message: "reconnect" }));
    const stopped = await publishReplyWithRetry({ publish: auth, resume: vi.fn(), sleep, delays: [1, 1] });
    expect(stopped.attempts).toBe(1);
  });
});
