import { describe, expect, it } from "vitest";
import {
  DEFAULT_SORT,
  formatOf,
  narrowBy,
  paramsForView,
  resultCount,
  sortItems,
  sortOptions,
  topicOptions,
  viewFromParams,
  type ViewFilters,
} from "@/lib/libraryView";

type Item = { id: string; platform: "threads" | "instagram" | "blog"; format: string | null; topicId: string; topicTitle: string; at: number };
const item = (id: string, over: Partial<Item> = {}): Item => ({ id, platform: "threads", format: "thread", topicId: "t1", topicTitle: "Pricing", at: 1000, ...over });
const when = (i: Item) => i.at;
const ids = (items: Item[]) => items.map((i) => i.id);

const ITEMS: Item[] = [
  item("a", { at: 300, topicId: "t2", topicTitle: "wifi", platform: "instagram", format: "reel" }),
  item("b", { at: 100, topicId: "t1", topicTitle: "Pricing" }),
  item("c", { at: 200, topicId: "t3", topicTitle: "Atlas", platform: "instagram", format: "carousel" }),
  item("d", { at: 400, topicId: "t1", topicTitle: "Pricing", platform: "blog", format: null }),
  item("e", { at: 200, topicId: "t1", topicTitle: "Pricing", platform: "instagram", format: "caption" }),
];

describe("formatOf", () => {
  it("counts a blog draft as blog whatever its format says, and a threads draft with no format as a thread", () => {
    expect(formatOf({ platform: "blog", format: null })).toBe("blog");
    expect(formatOf({ platform: "blog", format: "thread" })).toBe("blog");
    expect(formatOf({ platform: "threads", format: null })).toBe("thread");
    expect(formatOf({ platform: "instagram", format: "reel" })).toBe("reel");
    expect(formatOf({ platform: "instagram", format: null })).toBe("");
    expect(formatOf({ platform: "instagram", format: "mystery" })).toBe("");
  });
});

describe("narrowBy", () => {
  it("narrows by topic and by format, and both together", () => {
    expect(ids(narrowBy(ITEMS, { topicId: "t1", format: "" }))).toEqual(["b", "d", "e"]);
    expect(ids(narrowBy(ITEMS, { topicId: "", format: "carousel" }))).toEqual(["c"]);
    expect(ids(narrowBy(ITEMS, { topicId: "t1", format: "caption" }))).toEqual(["e"]);
    expect(ids(narrowBy(ITEMS, { topicId: "", format: "" }))).toEqual(ids(ITEMS));
  });

  it("finds the blog draft under the Blog format even when a platform filter would hide it", () => {
    expect(ids(narrowBy(ITEMS, { topicId: "", format: "blog" }))).toEqual(["d"]);
  });

  it("returns nothing for a topic that has no items", () => {
    expect(narrowBy(ITEMS, { topicId: "gone", format: "" })).toEqual([]);
  });
});

describe("sortItems", () => {
  it("recently added puts the newest first, oldest the reverse", () => {
    expect(ids(sortItems(ITEMS, "newest", when))).toEqual(["d", "a", "c", "e", "b"]);
    expect(ids(sortItems(ITEMS, "oldest", when))).toEqual(["b", "c", "e", "a", "d"]);
  });

  it("topic A to Z ignores case and puts the newest first inside a topic", () => {
    expect(ids(sortItems(ITEMS, "topic", when))).toEqual(["c", "d", "e", "b", "a"]);
  });

  it("platform groups Threads, Instagram, then blog, newest first inside each", () => {
    expect(ids(sortItems(ITEMS, "platform", when))).toEqual(["b", "a", "c", "e", "d"]);
  });

  it("does not change the list it is given", () => {
    const copy = [...ITEMS];
    sortItems(ITEMS, "oldest", when);
    expect(ITEMS).toEqual(copy);
  });
});

describe("topicOptions and resultCount", () => {
  it("lists each topic once, A to Z, with its count", () => {
    expect(topicOptions(ITEMS)).toEqual([
      { id: "t3", title: "Atlas", count: 1 },
      { id: "t1", title: "Pricing", count: 3 },
      { id: "t2", title: "wifi", count: 1 },
    ]);
    expect(topicOptions([])).toEqual([]);
  });

  it("says how many show while narrowed", () => {
    expect(resultCount(12, 40, true, "draft")).toBe("12 of 40 drafts");
    expect(resultCount(1, 1, true, "post")).toBe("1 of 1 post");
    expect(resultCount(40, 40, false, "draft")).toBe("40 drafts");
    expect(resultCount(1, 1, false, "draft")).toBe("1 draft");
  });

  it("names the sort by what the dates mean", () => {
    expect(sortOptions("added")[0]).toEqual({ value: "newest", label: "Recently added" });
    expect(sortOptions("published")[0]).toEqual({ value: "newest", label: "Recently published" });
    expect(sortOptions("added").map((o) => o.value)).toEqual(["newest", "oldest", "topic", "platform"]);
  });
});

describe("the address", () => {
  const view: ViewFilters = { sort: "topic", topicId: "abc", format: "reel", pillar: "build", platform: "instagram" };

  it("round-trips a view", () => {
    const query = paramsForView("", view);
    expect(query).toBe("?sort=topic&topic=abc&format=reel&pillar=build&platform=instagram");
    expect(viewFromParams(new URLSearchParams(query))).toEqual(view);
  });

  it("leaves the plain address plain for the default view", () => {
    expect(paramsForView("", { sort: DEFAULT_SORT, topicId: "", format: "", pillar: "", platform: "" })).toBe("");
  });

  it("keeps parameters it does not own, and replaces its own", () => {
    expect(paramsForView("?frame=confession&sort=oldest", { ...view, topicId: "", format: "", pillar: "", platform: "" })).toBe("?frame=confession&sort=topic");
  });

  it("falls back to the default for values it does not know", () => {
    expect(viewFromParams(new URLSearchParams("sort=sideways&format=podcast&platform=tiktok"))).toEqual({
      sort: "newest",
      topicId: "",
      format: "",
      pillar: "",
      platform: "",
    });
  });
});
