import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftSaver, summarizeSaves } from "@/lib/draftSaver";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function make(save: (id: string, body: string) => Promise<unknown>) {
  return new DraftSaver({ save, now: () => 1000 });
}

describe("DraftSaver", () => {
  it("shows the edit immediately and saves once after the debounce", async () => {
    const save = vi.fn().mockResolvedValue(null);
    const saver = make(save);
    saver.change("d1", "a");
    saver.change("d1", "ab");
    saver.change("d1", "abc");
    expect(saver.valueFor("d1", "server")).toBe("abc");
    expect(saver.getSnapshot().status.d1.state).toBe("dirty");
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(800);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("d1", "abc");
    expect(saver.getSnapshot().status.d1).toEqual({ state: "saved", savedAt: 1000 });
  });

  it("falls back to the server body when nothing was typed", () => {
    expect(make(vi.fn()).valueFor("d1", "server")).toBe("server");
  });

  it("flush sends right away and resolves when saved", async () => {
    const save = vi.fn().mockResolvedValue(null);
    const saver = make(save);
    saver.change("d1", "text");
    await saver.flush("d1");
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps the edit and reports the error when a save fails, then retries automatically", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(null);
    const saver = make(save);
    saver.change("d1", "keep me");
    await vi.advanceTimersByTimeAsync(800);
    expect(saver.getSnapshot().status.d1).toMatchObject({ state: "error", error: "offline" });
    expect(saver.valueFor("d1", "server")).toBe("keep me");
    await vi.advanceTimersByTimeAsync(4000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(saver.getSnapshot().status.d1.state).toBe("saved");
  });

  it("stops retrying on its own after the limit but a manual flush still works", async () => {
    const save = vi.fn().mockRejectedValue(new Error("down"));
    const saver = make(save);
    saver.change("d1", "x");
    await vi.advanceTimersByTimeAsync(800 + 4000 + 4000);
    const calls = save.mock.calls.length;
    expect(calls).toBe(3);
    await vi.advanceTimersByTimeAsync(20000);
    expect(save).toHaveBeenCalledTimes(calls);
    save.mockResolvedValue(null);
    await saver.flush("d1");
    expect(saver.getSnapshot().status.d1.state).toBe("saved");
  });

  it("stays dirty when more is typed during a save", async () => {
    let release: () => void = () => undefined;
    const save = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => (release = resolve))
    );
    const saver = make(save);
    saver.change("d1", "one");
    const first = saver.flush("d1");
    await Promise.resolve();
    saver.change("d1", "one two");
    release();
    await first;
    expect(saver.getSnapshot().status.d1.state).toBe("dirty");
    expect(saver.valueFor("d1", "server")).toBe("one two");
  });

  it("flushAll saves every draft with pending text", async () => {
    const save = vi.fn().mockResolvedValue(null);
    const saver = make(save);
    saver.change("d1", "a");
    saver.change("d2", "b");
    await saver.flushAll();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("fires pending saves without waiting on unload", () => {
    const save = vi.fn().mockResolvedValue(null);
    const saver = make(save);
    saver.change("d1", "a");
    saver.flushOnUnload();
    expect(save).toHaveBeenCalledWith("d1", "a");
  });

  it("discard forgets edits so the server text shows again", async () => {
    const save = vi.fn().mockResolvedValue(null);
    const saver = make(save);
    saver.change("d1", "typed");
    saver.discard();
    expect(saver.valueFor("d1", "server")).toBe("server");
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
  });

  it("notifies subscribers and hands out a new snapshot per change", () => {
    const saver = make(vi.fn().mockResolvedValue(null));
    const listener = vi.fn();
    saver.subscribe(listener);
    const before = saver.getSnapshot();
    saver.change("d1", "a");
    expect(listener).toHaveBeenCalled();
    expect(saver.getSnapshot()).not.toBe(before);
  });
});

describe("summarizeSaves", () => {
  it("ranks error above saving above dirty above saved", () => {
    const snap = {
      edits: {},
      status: {
        a: { state: "saved" as const, savedAt: 5 },
        b: { state: "dirty" as const },
        c: { state: "error" as const, error: "boom" },
      },
    };
    expect(summarizeSaves(snap, ["a"]).state).toBe("saved");
    expect(summarizeSaves(snap, ["a", "b"]).state).toBe("dirty");
    const all = summarizeSaves(snap, ["a", "b", "c"]);
    expect(all.state).toBe("error");
    expect(all.failed).toEqual(["c"]);
    expect(all.savedAt).toBe(5);
    expect(summarizeSaves(snap, ["zzz"]).state).toBe("idle");
  });
});
