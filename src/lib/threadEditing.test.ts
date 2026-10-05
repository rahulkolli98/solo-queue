import { describe, expect, it } from "vitest";
import { MAX_THREAD_POSTS, addPost, movePost, removePost } from "./draftText";

describe("addPost", () => {
  it("adds an empty post at the end", () => {
    expect(addPost(["a", "b"])).toEqual(["a", "b", ""]);
  });

  it("stops at the most posts a thread can have", () => {
    const full = Array.from({ length: MAX_THREAD_POSTS }, (_, i) => `p${i}`);
    expect(addPost(full)).toBe(full);
  });
});

describe("removePost", () => {
  it("removes the chosen post and keeps the rest in order", () => {
    expect(removePost(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });

  it("never leaves a thread with no post: the last one is emptied", () => {
    expect(removePost(["only"], 0)).toEqual([""]);
  });

  it("ignores an index that is not there", () => {
    const posts = ["a", "b"];
    expect(removePost(posts, 5)).toBe(posts);
  });
});

describe("movePost", () => {
  it("swaps a post with its neighbour", () => {
    expect(movePost(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(movePost(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("does nothing at the ends", () => {
    const posts = ["a", "b"];
    expect(movePost(posts, 0, -1)).toBe(posts);
    expect(movePost(posts, 1, 1)).toBe(posts);
  });
});
