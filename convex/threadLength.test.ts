import { describe, expect, it } from "vitest";
import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import { MAX_THREAD_POSTS, threadsConstraint } from "./lib/drafting";
import { insertDraft, insertTopic, newTest } from "../src/test-utils/convex";

const data = (e: unknown) => String((e as ConvexError<string>).data);
const thread = (n: number) => Array.from({ length: n }, (_, i) => `Post number ${i + 1}.`).join("\n---\n");

describe("thread length", () => {
  it("a thread may have up to 25 posts and no more", () => {
    expect(threadsConstraint(thread(MAX_THREAD_POSTS)).constraintOk).toBe(true);
    expect(threadsConstraint(thread(MAX_THREAD_POSTS + 1)).constraintOk).toBe(false);
  });

  it("refuses to queue a thread with too many posts, saying how many it has", async () => {
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    const draft = await insertDraft(t, topic, "threads", thread(26));
    const err = await t.mutation(api.slots.enqueue, { draftId: draft }).catch((e: unknown) => e);
    expect(data(err)).toMatch(/^VALIDATION:TOO_MANY_POSTS: This thread has 26 posts/);
  });

  it("queues a long thread that is within the limit", async () => {
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    const draft = await insertDraft(t, topic, "threads", thread(10));
    await expect(t.mutation(api.slots.enqueue, { draftId: draft })).resolves.toBeTruthy();
  });

  it("writing a thread for you accepts 2 to 12 posts and refuses anything else before calling the model", async () => {
    const t = newTest();
    const topic = await insertTopic(t, "A topic");
    for (const bad of [1, 13, 3.5, 0, -2]) {
      const err = await t.action(api.drafting.generate, { topicId: topic, formats: ["threads"], postCount: bad }).catch((e: unknown) => e);
      expect(data(err)).toMatch(/^VALIDATION:BAD_POST_COUNT/);
    }
  });
});
