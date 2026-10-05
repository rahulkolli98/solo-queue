import { ConvexError } from "convex/values";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { refusalText } from "@/lib/refusalText";
import { postsOf, threadChecks } from "@/lib/researchThread";
import ThreadSectionView from "./ThreadSectionView";
import type { TopicThread } from "./useTopicThread";

function thread(over: Partial<TopicThread> & { text?: string }): TopicThread {
  const { text, ...rest } = over;
  const posts = rest.posts ?? postsOf(text);
  const hasThread = rest.hasThread ?? Boolean(text?.trim());
  return {
    status: "ready",
    posts,
    onChange: () => {},
    hasThread,
    save: hasThread ? "saved" : "empty",
    checks: threadChecks(posts),
    saving: false,
    queuing: false,
    queuedLabel: null,
    error: null,
    studioNewer: false,
    useStudioVersion: () => {},
    saveNow: () => {},
    queue: () => {},
    leave: () => {},
    openInStudio: () => {},
    studioHref: "/studio/t1?from=research",
    ...rest,
  };
}

const view = (t: TopicThread) => renderToStaticMarkup(<ThreadSectionView thread={t} topicId="t1" />);
const disabled = (label: string) => new RegExp(`<button[^>]*disabled=""[^>]*>${label}`);

describe("YOUR THREAD section", () => {
  it("shows a loading skeleton", () => {
    const out = view(thread({ status: "loading" }));
    expect(out).toContain("Loading your thread");
    expect(out).toContain('aria-busy="true"');
    expect(out).not.toContain("Save thread");
  });

  it("starts a topic with no thread on one empty post and the invitation", () => {
    const out = view(thread({}));
    expect(out).toContain("YOUR THREAD");
    expect(out).toContain("Write your own thread here, or open Studio to have one written from your brief.");
    expect(out).toContain("POST 1 · THE HOOK");
    expect(out).not.toContain("POST 2");
    expect(out).toContain("Not saved yet");
    expect(out).toMatch(disabled("Save thread"));
    expect(out).toContain("Write at least one post first.");
    expect(out).not.toContain("Queue this thread");
    expect(out).not.toContain("Open in Studio");
  });

  it("shows a saved thread post by post, Saved, with Queue and Open in Studio", () => {
    const out = view(thread({ text: "Hook line\n---\nSecond post\n---\nThird post" }));
    expect(out).toContain("Hook line");
    expect(out).toContain("Second post");
    expect(out).toContain("Third post");
    expect(out).toContain("POST 3");
    expect(out).toContain(">Saved<");
    expect(out).not.toContain("Write your own thread here");
    expect(out).toContain("Queue this thread");
    expect(out).toContain("Open in Studio");
    expect(out).toContain('href="/studio/t1?from=research"');
    expect(out).not.toContain("draft=1");
    expect(out).not.toMatch(disabled("Queue this thread"));
  });

  it("marks edited text as Unsaved changes and enables Save", () => {
    const out = view(thread({ text: "One\n---\nTwo", save: "unsaved" }));
    expect(out).toContain("Unsaved changes");
    expect(out).not.toMatch(disabled("Save thread"));
  });

  it("shows Saving while the save runs", () => {
    const out = view(thread({ text: "One", save: "saving", saving: true }));
    expect(out).toContain("Saving…");
    expect(out).toMatch(disabled("Saving…"));
  });

  it("names the over-long post, still allows saving and blocks Queue", () => {
    const out = view(thread({ text: `fine\n---\n${"x".repeat(537)}`, save: "unsaved" }));
    expect(out).toContain("Post 2 is 37 characters over the 500 limit. Shorten it to queue.");
    expect(out).toContain("537 / 500 · OVER THE LIMIT");
    expect(out).not.toMatch(disabled("Save thread"));
    expect(out).toMatch(disabled("Queue this thread"));
  });

  it("blocks a thread with more than 25 posts", () => {
    const text = Array.from({ length: 26 }, (_, i) => `post ${i}`).join("\n---\n");
    const out = view(thread({ text, save: "unsaved" }));
    expect(out).toContain("A thread can have at most 25 posts. This one has 26. Remove 1.");
    expect(out).toMatch(disabled("Save thread"));
    expect(out).toMatch(disabled("Queue this thread"));
  });

  it("shows the slot time instead of the Queue button once queued", () => {
    const out = view(thread({ text: "One\n---\nTwo", queuedLabel: "Queued for Mon 5 Oct, 19:00" }));
    expect(out).toContain("Queued for Mon 5 Oct, 19:00");
    expect(out).toContain('href="/queue"');
    expect(out).not.toContain("Queue this thread");
    expect(out).toContain("Open in Studio");
  });

  it("shows a queue refusal from the backend in full, inline", () => {
    const message = "This draft still has a [[placeholder]] to fill in. Replace or delete it before queueing.";
    const error = refusalText(new ConvexError(`VALIDATION:PLACEHOLDER: ${message}`), "Couldn't queue this thread. Try again.");
    const out = view(thread({ text: "Hello [[name]]", error }));
    expect(out).toContain('role="alert"');
    expect(out).toContain(message);
  });

  it("shows a save refusal inline", () => {
    const error = refusalText(new ConvexError("VALIDATION:TOPIC_NOT_FOUND: Topic not found. It may have been deleted."), "x");
    expect(view(thread({ text: "One", save: "unsaved", error }))).toContain("Topic not found. It may have been deleted.");
  });

  it("tells the founder when Studio changed the thread under their edit", () => {
    const out = view(thread({ text: "Mine", save: "unsaved", studioNewer: true }));
    expect(out).toContain("This thread was changed in Studio while you were editing.");
    expect(out).toContain("Use the Studio version");
  });

  it("explains a deleted or archived topic and offers no editor", () => {
    const deleted = view(thread({ status: "gone", goneReason: "deleted" }));
    expect(deleted).toContain("This topic was deleted, so its thread can&#x27;t be edited here.");
    expect(deleted).not.toContain("Save thread");
    const archived = view(thread({ status: "gone", goneReason: "archived" }));
    expect(archived).toContain("This topic is archived");
    expect(archived).not.toContain("POST 1");
  });
});
