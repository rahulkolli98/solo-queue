import { describe, expect, it } from "vitest";
import {
  barSummary,
  draftsNeedingFix,
  queueKindsOf,
  studioGuide,
  type ReadyState,
  type Readiness,
} from "@/lib/studioModel";

const r = (state: ReadyState): Readiness => ({ state, overBy: 0, reason: "" });

// The case from the founder: a thread, a caption and a carousel are good to go; the reel script has no video yet.
const states = { threads: r("ready"), caption: r("ready"), reel: r("media_required"), carousel: r("ready") };

describe("choosing what goes to the queue", () => {
  it("queueKindsOf drops the switched-off kinds and keeps the carousel only when there is one", () => {
    expect(queueKindsOf(states)).toEqual(["threads", "caption", "reel", "carousel"]);
    expect(queueKindsOf(states, ["reel"])).toEqual(["threads", "caption", "carousel"]);
    expect(queueKindsOf({ threads: r("ready") }, ["caption"])).toEqual(["threads", "reel"]);
  });

  it("an unfinished reel blocks nothing once it is switched off", () => {
    expect(draftsNeedingFix(states)).toEqual(["reel"]);
    expect(draftsNeedingFix(states, [], ["reel"])).toEqual([]);
  });

  it("the bar counts only what is switched on, and the button says how many", () => {
    const all = barSummary({ states, generating: false, emptySub: "" });
    expect(all).toMatchObject({ readyCount: 3, needFixing: 1, canQueue: true, buttonLabel: "Queue 3 posts" });
    const picked = barSummary({ states, generating: false, emptySub: "", excluded: ["reel"] });
    expect(picked).toMatchObject({ readyCount: 3, needFixing: 0, canQueue: true, buttonLabel: "Queue 3 posts" });
    expect(picked.headline).toBe("3 drafts ready");
    const onlyCarouselAndCaption = barSummary({ states, generating: false, emptySub: "", excluded: ["reel", "threads"] });
    expect(onlyCarouselAndCaption).toMatchObject({ readyCount: 2, needFixing: 0, canQueue: true, buttonLabel: "Queue 2 posts" });
  });

  it("with every draft switched off there is nothing to queue, and it says so", () => {
    const none = barSummary({ states, generating: false, emptySub: "", excluded: ["threads", "caption", "reel", "carousel"] });
    expect(none).toMatchObject({ headline: "Nothing picked", canQueue: false, buttonLabel: "Pick what to queue" });
  });

  it("a switched-off kind that was never written is not reported as missing", () => {
    const written = { threads: r("ready"), caption: r("missing"), reel: r("missing") };
    expect(barSummary({ states: written, generating: false, emptySub: "" }).headline).toBe("1 of 3 ready");
    expect(barSummary({ states: written, generating: false, emptySub: "", excluded: ["caption", "reel"] }).headline).toBe("1 draft ready");
  });

  it("the next-step sentence stops asking for the reel's media", () => {
    const base = { generating: false, generationFailed: false, manualText: false, hasOpenSlot: true, states };
    expect(studioGuide(base).text).toMatch(/reel/);
    const picked = studioGuide({ ...base, excluded: ["reel"] });
    expect(picked.text).not.toMatch(/reel/);
    expect(picked).toMatchObject({ tone: "go", text: "All set: press Queue 3 posts." });
  });

  it("with everything switched off the sentence tells the founder to switch one on", () => {
    const g = studioGuide({
      generating: false,
      generationFailed: false,
      manualText: false,
      hasOpenSlot: true,
      states,
      excluded: ["threads", "caption", "reel", "carousel"],
    });
    expect(g.text).toMatch(/switch/i);
    expect(g.tone).toBe("info");
  });
});
