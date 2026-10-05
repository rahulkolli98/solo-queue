import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  calls: 0,
  board: [{ _id: "t1", title: "Why I stopped scheduling", status: "ready", pillar: "tools" }] as unknown[] | undefined,
}));

vi.mock("convex/react", () => ({
  // NewTopicColumn reads the inbox board first, then the settings, on every render.
  useQuery: () => (hooks.calls++ % 2 === 0 ? hooks.board : undefined),
  useMutation: () => vi.fn(),
  useConvex: () => ({ query: vi.fn() }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import ManualThread from "@/components/features/studio/ManualThread";
import NewTopicColumn from "@/components/features/studio/NewTopicColumn";
import ReplaceConfirm from "@/components/features/studio/ReplaceConfirm";
import { GenerateControls, PostsControl } from "@/components/features/studio/StudioActions";
import ThreadsColumn from "@/components/features/studio/ThreadsColumn";
import ThreadPostRow from "@/components/features/studio/ThreadPostRow";
import type { DraftView, GenState } from "@/components/features/studio/types";
import type { Draft, Readiness } from "@/lib/studioModel";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const idle: GenState = { writing: false, error: null, elapsed: "0:00", onRetry: vi.fn(), retrying: false };
const ready: Readiness = { state: "ready", overBy: 0, reason: "" };
const missing: Readiness = { state: "missing", overBy: 0, reason: "NOT WRITTEN" };

function view(body: string): DraftView {
  return { draft: { _id: "d1", templateVersion: 1 } as unknown as Draft, body, onChange: vi.fn(), onBlur: vi.fn() };
}

const column = (props: Partial<React.ComponentProps<typeof ThreadsColumn>> = {}) =>
  html(
    <ThreadsColumn
      view={view("One\n---\nTwo\n---\nThree")}
      beats={[{ label: "Hook" }, { label: "Tension" }]}
      readiness={ready}
      gen={idle}
      placeholders={[]}
      emptyCopy="x"
      {...props}
    />
  );

describe("a saved thread is edited like a thread", () => {
  it("shows + Add post and the N / 25 posts count under the last post", () => {
    const out = column();
    expect(out).toContain("+ Add post");
    expect(out).toContain("3 / 25 posts");
    expect(out).not.toMatch(/<button[^>]*disabled[^>]*>\s*\+ Add post/);
  });

  it("labels Up, Down and Remove per post, and the ends cannot move off the list", () => {
    const out = column();
    for (const n of [1, 2, 3]) {
      expect(out).toContain(`aria-label="Move post ${n} up"`);
      expect(out).toContain(`aria-label="Move post ${n} down"`);
      expect(out).toContain(`aria-label="Remove post ${n}"`);
    }
    expect(out).toMatch(/<button[^>]*id="studio-post-0-up"[^>]*disabled=""|<button[^>]*disabled=""[^>]*id="studio-post-0-up"/);
    expect(out).toMatch(/<button[^>]*id="studio-post-2-down"[^>]*disabled=""|<button[^>]*disabled=""[^>]*id="studio-post-2-down"/);
    expect(out).not.toMatch(/<button[^>]*id="studio-post-1-up"[^>]*disabled/);
  });

  it("keeps the beat labels and the N / 500 counters", () => {
    const out = column();
    expect(out).toContain("HOOK · 3 / 500");
    expect(out).toContain("TENSION · 3 / 500");
    expect(out).toContain("3-POST THREAD");
  });

  it("at 25 posts the Add post button is disabled and says 25 / 25", () => {
    const body = Array.from({ length: 25 }, (_, i) => `p${i}`).join("\n---\n");
    const out = column({ view: view(body) });
    expect(out).toContain("25 / 25 posts");
    expect(out).toMatch(/<button[^>]*id="studio-add-post"[^>]*disabled=""|<button[^>]*disabled=""[^>]*id="studio-add-post"/);
  });

  it("the only post cannot be removed", () => {
    const out = column({ view: view("Only") });
    expect(out).toMatch(/<button[^>]*id="studio-post-0-remove"[^>]*disabled=""|<button[^>]*disabled=""[^>]*id="studio-post-0-remove"/);
  });

  it("a post row offers Remove first, and still Trim to fit / Split in 2 when over", () => {
    const row = html(
      <ThreadPostRow
        index={1}
        text={"x".repeat(520)}
        beat="Tension"
        last={false}
        onChange={vi.fn()}
        onTrim={vi.fn()}
        onSplit={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
      />
    );
    expect(row).toContain("520 / 500 · OVER BY 20");
    expect(row).toContain("Trim to fit");
    expect(row).toContain("Split in 2");
    expect(row).toContain(">Remove<");
    expect(row).toContain('aria-label="Post 2 actions"');
  });
});

describe("Write it myself uses the post-by-post writer", () => {
  it("the empty column offers Write it myself and mentions both routes", () => {
    const out = html(
      <ThreadsColumn
        readiness={missing}
        gen={idle}
        placeholders={["Hook", "Tension"]}
        emptyCopy="Press Generate drafts and the thread lands here, or write it yourself."
      />
    );
    expect(out).toContain("Write it myself");
    expect(out).toContain("write it yourself");
  });

  it("with the writer open (?write=1) it shows one box per post, Add post, Save draft and no generation", () => {
    const out = html(
      <ThreadsColumn
        readiness={missing}
        gen={idle}
        placeholders={["Hook"]}
        emptyCopy="x"
        writing
        onSaveManual={async () => {}}
      />
    );
    expect(out).toContain('data-tone="dark"');
    expect(out).toContain("POST 1 · THE HOOK");
    expect(out).toContain("+ Add post");
    expect(out).toContain("1 / 25 posts");
    expect(out).toContain("Save draft");
    expect(out).not.toContain("<textarea class=\"studio-textarea studio-manual-field");
  });

  it("the error state's Write it myself opens the same writer", () => {
    const out = html(
      <ThreadsColumn
        readiness={missing}
        gen={{ ...idle, error: "The writing model timed out." }}
        placeholders={[]}
        emptyCopy="x"
        writing
        onSaveManual={async () => {}}
        onWriting={vi.fn()}
      />
    );
    expect(out).toContain("+ Add post");
    expect(out).toContain("Try drafting again");
  });

  it("ManualThread: Save draft starts disabled until something is written, and says it is not saved", () => {
    const out = html(<ManualThread onSave={async () => {}} />);
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Save draft/);
    expect(out).toContain("NOTHING WRITTEN YET");
    expect(out).toContain("Not saved yet. Press Save draft");
  });

  it("ManualThread without a save handler warns the text is only on this page", () => {
    expect(html(<ManualThread />)).toContain("only on this page");
  });

  it("the skeleton shows as many posts as were asked for", () => {
    const out = html(
      <ThreadsColumn
        readiness={missing}
        gen={{ ...idle, writing: true }}
        beats={[{ label: "Hook" }, { label: "Tension" }]}
        placeholders={["Hook", "Tension"]}
        emptyCopy="x"
        expectedPosts={6}
      />
    );
    expect(out.match(/studio-skel"/g)).toHaveLength(6);
  });
});

describe("Posts control", () => {
  it("offers 2 to 12, labelled, with the helper line", () => {
    const out = html(<PostsControl value={4} steps={4} disabled={false} onChange={vi.fn()} />);
    expect(out).toContain(">Posts<");
    expect(out).toContain('<option value="2">2</option>');
    expect(out).toContain('<option value="12">12</option>');
    expect(out).not.toContain('<option value="13"');
    expect(out).toContain('<option value="4" selected="">4</option>');
    expect(out).toContain("A story frame has 4 steps; more posts stretch them.");
    expect(out).toContain("aria-describedby");
  });

  it("is disabled while the model is writing", () => {
    expect(html(<PostsControl value={4} steps={4} disabled onChange={vi.fn()} />)).toMatch(/<select[^>]*disabled/);
  });

  it("sits beside Generate drafts / Regenerate all", () => {
    const base = { running: false, onGenerate: vi.fn(), posts: { value: 6, steps: 4, onChange: vi.fn() } };
    const fresh = html(<GenerateControls {...base} hasDrafts={false} />);
    expect(fresh).toContain("Generate drafts");
    expect(fresh).toContain('<option value="6" selected="">6</option>');
    expect(html(<GenerateControls {...base} hasDrafts />)).toContain("Regenerate all");
  });
});

describe("replace confirmation", () => {
  it("is an inline group with Replace and Keep it, named by its question", () => {
    const out = html(
      <ReplaceConfirm message="This replaces the thread you have written. Replace it?" onReplace={vi.fn()} onKeep={vi.fn()} />
    );
    expect(out).toContain('role="group"');
    expect(out).toContain("aria-labelledby");
    expect(out).toContain("This replaces the thread you have written. Replace it?");
    expect(out).toContain(">Replace<");
    expect(out).toContain(">Keep it<");
    expect(out).not.toContain("alertdialog");
  });
});

describe("new topic and inbox: two ways in", () => {
  it("keeps Save and draft both and adds a secondary Save and write it myself", () => {
    const out = html(<NewTopicColumn />);
    expect(out).toContain("Save and draft both");
    expect(out).toContain("Save and write it myself");
    expect(out).toMatch(/<button type="submit"[^>]*>Save and draft both/);
    expect(out).toMatch(/<button type="button"[^>]*>Save and write it myself/);
  });

  it("inbox rows have Draft (?draft=1) and Write (?write=1) beside it", () => {
    const out = html(<NewTopicColumn />);
    expect(out).toContain('href="/studio/t1?draft=1"');
    expect(out).toContain('href="/studio/t1?write=1"');
    expect(out).toContain('aria-label="Draft Why I stopped scheduling"');
    expect(out).toContain('aria-label="Write Why I stopped scheduling yourself"');
    expect(out).toContain(">Write<");
  });
});
