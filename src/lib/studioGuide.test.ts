import { describe, expect, it } from "vitest";
import {
  FRAME_EXPLAINER,
  frameBeatsLine,
  pickFrameKey,
  studioGuide,
  studioHomeGuide,
  type DraftKind,
  type GuideInput,
  type ReadyState,
  type Readiness,
} from "@/lib/studioModel";

const r = (state: ReadyState): Readiness => ({ state, overBy: 0, reason: "" });

function guide(over: Partial<GuideInput> & { s?: Partial<Record<DraftKind, ReadyState>> }) {
  const s = over.s ?? {};
  return studioGuide({
    generating: false,
    generationFailed: false,
    manualText: false,
    hasOpenSlot: true,
    ...over,
    states: {
      threads: r(s.threads ?? "missing"),
      caption: r(s.caption ?? "missing"),
      reel: r(s.reel ?? "missing"),
    },
  });
}

const stepStates = (g: ReturnType<typeof guide>) => g.steps.map((x) => `${x.number}:${x.state}`).join(" ");

describe("studioGuide: the 4-step strip", () => {
  it("names the four steps in order", () => {
    expect(guide({}).steps.map((x) => x.label)).toEqual(["Topic", "Drafts", "Media for Instagram", "Queue"]);
  });

  it("starts on Drafts: the topic is done, nothing is written", () => {
    expect(stepStates(guide({}))).toBe("1:done 2:current 3:todo 4:todo");
  });

  it("moves to Media once all three drafts exist", () => {
    const g = guide({ s: { threads: "ready", caption: "media_required", reel: "media_required" } });
    expect(stepStates(g)).toBe("1:done 2:done 3:current 4:todo");
  });

  it("moves to Queue when everything written is ready", () => {
    const g = guide({ s: { threads: "ready", caption: "ready", reel: "ready" } });
    expect(stepStates(g)).toBe("1:done 2:done 3:done 4:current");
  });

  it("marks every step done once the posts are queued", () => {
    const g = guide({ s: { threads: "queued", caption: "queued", reel: "queued" } });
    expect(stepStates(g)).toBe("1:done 2:done 3:done 4:done");
    expect(g.tone).toBe("done");
  });

  it("stays on Drafts while a draft is missing, even when the written ones are ready", () => {
    expect(stepStates(guide({ s: { threads: "ready" } }))).toBe("1:done 2:current 3:todo 4:todo");
  });

  it("the home guide puts you on step 1", () => {
    const g = studioHomeGuide(true);
    expect(stepStates(g)).toBe("1:current 2:todo 3:todo 4:todo");
    expect(g.text).toMatch(/Save and draft both/);
    expect(g.text).toMatch(/Save and write it myself/);
    expect(g.text).toMatch(/inbox/);
  });
});

describe("studioGuide: the one sentence of what to do next", () => {
  it("before any draft: both routes are offered, generate or write it yourself", () => {
    const g = guide({});
    expect(g.text).toBe("Press Generate drafts, or press Write it myself to write the thread yourself.");
    expect(g.tone).toBe("info");
  });

  it("with the writer open: save the thread, or let the model write it", () => {
    const g = guide({ writerOpen: true });
    expect(g.text).toMatch(/^Write your thread in the boxes, then press Save draft\./);
    expect(g.text).toMatch(/Generate drafts/);
  });

  it("a hand-written thread with no Instagram drafts offers Queue, Generate, or writing them yourself", () => {
    const g = guide({ s: { threads: "ready" } });
    expect(g.text).toContain("Your thread is ready.");
    expect(g.text).toContain("press Generate drafts or Retry, or write them yourself.");
    expect(g.text).toContain("Queue 1 post");
  });

  it("from Research with the thread written and Instagram drafts waiting on media: thread is here, add media, Queue", () => {
    const g = guide({
      fromResearch: true,
      s: { threads: "ready", caption: "media_required", reel: "media_required" },
    });
    expect(g.text).toBe(
      "Your thread from Research is here. Add media for Instagram if you want it, then press Queue posts."
    );
    expect(g.tone).toBe("go");
  });

  it("from Research with only the thread: it can be queued, and Generate asks before replacing it", () => {
    const g = guide({ fromResearch: true, s: { threads: "ready" } });
    expect(g.text).toContain("Your thread from Research is here.");
    expect(g.text).toContain("Press Queue 1 post");
    expect(g.text).toContain("it asks before it replaces your thread");
  });

  it("from Research, an over-long thread is still fixed first", () => {
    const g = guide({ fromResearch: true, s: { threads: "over" } });
    expect(g.text).not.toContain("from Research");
    expect(g.text).toContain("Trim to fit");
  });

  it("while writing: wait", () => {
    const g = guide({ generating: true });
    expect(g.tone).toBe("wait");
    expect(g.text).toMatch(/Writing your drafts/);
  });

  it("after a failed run with nothing written: read the reason, then Retry or Write it myself", () => {
    const g = guide({ generationFailed: true });
    expect(g.tone).toBe("fix");
    expect(g.text).toBe("Drafting failed: the reason is shown above. Fix it and press Retry, or press Write it myself.");
  });

  it("typed text in Write it myself says to press Save draft, so the way forward is clear", () => {
    const g = guide({ generationFailed: true, manualText: true });
    expect(g.text).toMatch(/not saved yet/);
    expect(g.text).toMatch(/Press Save draft/);
    expect(g.text).toMatch(/queue it/);
  });

  it("thread ready, Instagram needs media: says so and names where to attach", () => {
    const g = guide({ s: { threads: "ready", caption: "media_required", reel: "media_required" } });
    expect(g.text).toContain("Your thread is ready.");
    expect(g.text).toContain("Instagram needs media: attach a photo or video to the reel and caption");
    expect(g.text).toContain("press Attach media and upload one right there");
    expect(g.text).toContain("Queue 1 post");
    expect(g.tone).toBe("fix");
  });

  it("only the reel needs media", () => {
    const g = guide({ s: { threads: "ready", caption: "ready", reel: "media_required" } });
    expect(g.text).toContain("to the reel (");
    expect(g.text).not.toContain("reel and caption");
    expect(g.text).toContain("Queue 2 posts");
  });

  it("media that needs a check or a recheck says which button", () => {
    expect(guide({ s: { threads: "ready", caption: "ready", reel: "media_unverified" } }).text).toContain(
      "Press Check on the reel media"
    );
    expect(guide({ s: { threads: "ready", caption: "media_stale", reel: "ready" } }).text).toContain(
      "Press Recheck on the caption media"
    );
    expect(guide({ s: { threads: "ready", caption: "ready", reel: "media_missing" } }).text).toContain(
      "The media on the reel is gone: attach another"
    );
  });

  it("names the Threads post that is over the limit", () => {
    const g = guide({ s: { threads: "over", caption: "ready", reel: "ready" }, firstOverPost: 2 });
    expect(g.text).toContain("Over the 500-character limit on post 2: use Trim to fit.");
    expect(g.tone).toBe("fix");
  });

  it("an over-long caption is named with its limit", () => {
    const g = guide({ s: { threads: "ready", caption: "over", reel: "ready" } });
    expect(g.text).toContain("The caption is over the 2,200-character limit");
  });

  it("a missing draft is called out", () => {
    const g = guide({ s: { threads: "ready", caption: "ready" } });
    expect(g.text).toContain("The reel script is not written");
  });

  it("everything ready: All set, press Queue N posts", () => {
    const g = guide({ s: { threads: "ready", caption: "ready", reel: "ready" } });
    expect(g.text).toBe("All set: press Queue 3 posts.");
    expect(g.tone).toBe("go");
  });

  it("everything ready but no open slot: says why and where to fix it", () => {
    const g = guide({ s: { threads: "ready", caption: "ready", reel: "ready" }, hasOpenSlot: false });
    expect(g.text).toContain("no open slot in the next 2 weeks");
    expect(g.text).toContain("Settings");
  });

  it("queued: nothing left to do", () => {
    const g = guide({ s: { threads: "queued", caption: "queued", reel: "queued" } });
    expect(g.text).toMatch(/^All queued/);
  });
});

describe("story frame defaults and wording", () => {
  const frames = [{ key: "confession" }, { key: "receipt" }];

  it("preselects your pick, else the thread's frame, else the voice default, else the first frame", () => {
    expect(pickFrameKey({ chosen: "receipt", threadsFrameKey: "confession", defaultKey: "confession", frames })).toBe("receipt");
    expect(pickFrameKey({ chosen: null, threadsFrameKey: "receipt", defaultKey: "confession", frames })).toBe("receipt");
    expect(pickFrameKey({ chosen: null, defaultKey: "confession", frames })).toBe("confession");
    expect(pickFrameKey({ chosen: null, defaultKey: "deleted-frame", frames })).toBe("confession");
    expect(pickFrameKey({ chosen: null, frames })).toBe("confession");
    expect(pickFrameKey({ chosen: null, frames: undefined })).toBe("");
  });

  it("keeps the voice default while the frame list is still loading", () => {
    expect(pickFrameKey({ chosen: null, defaultKey: "confession", frames: undefined })).toBe("confession");
  });

  it("lists a frame's beats and explains what a frame is", () => {
    expect(frameBeatsLine({ beats: [{ label: "Admit" }, { label: "Cost" }, { label: "Fix" }, { label: "Invite" }] })).toBe(
      "Admit, Cost, Fix, Invite"
    );
    expect(FRAME_EXPLAINER).toContain("A story frame is the shape of the post");
    expect(FRAME_EXPLAINER).toContain("Pick one, or leave the default.");
  });
});
