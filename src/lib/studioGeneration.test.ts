import { describe, expect, it } from "vitest";
import { generationProgress, generationProgressSince, kindOfFormat, type Draft } from "@/lib/studioModel";

const draft = (id: string, createdAt: number) => ({ _id: id, createdAt }) as unknown as Draft;

describe("kindOfFormat", () => {
  it("maps each generate name to the draft kind, and an unknown name to nothing", () => {
    expect(kindOfFormat("threads")).toBe("threads");
    expect(kindOfFormat("instagram-caption")).toBe("caption");
    expect(kindOfFormat("instagram-reel")).toBe("reel");
    expect(kindOfFormat("instagram-carousel")).toBe("carousel");
    expect(kindOfFormat("blog")).toBe("blog");
    expect(kindOfFormat("podcast")).toBeUndefined();
  });
});

describe("generationProgressSince: a run this page did not start", () => {
  it("counts a requested kind as written once its draft was stored after the run began", () => {
    const latest = { threads: draft("new", 2_000), caption: draft("old", 500) };
    const p = generationProgressSince(["threads", "caption", "reel"], latest, 1_000);
    expect(p.fresh).toEqual(["threads"]);
    expect(p).toMatchObject({ done: 1, total: 3, current: "caption" });
  });

  it("a draft stored at the very start counts, and nothing counts before anything landed", () => {
    expect(generationProgressSince(["threads"], { threads: draft("a", 1_000) }, 1_000).fresh).toEqual(["threads"]);
    expect(generationProgressSince(["threads"], {}, 1_000)).toMatchObject({ done: 0, total: 1, current: "threads" });
  });

  it("agrees with the page's own count when the run started at the same moment", () => {
    const latest = { threads: draft("new", 5_000), reel: draft("old", 100) };
    const own = generationProgress(["threads", "reel"], latest, new Set(["old"]));
    const server = generationProgressSince(["threads", "reel"], latest, 1_000);
    expect(server.fresh).toEqual(own.fresh);
  });
});
