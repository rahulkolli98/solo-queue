import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PostsControl } from "@/components/features/studio/StudioActions";
import { defaultPostCount, postCountToSend, postsHelper, savedPostCount } from "@/lib/studioCompose";

const settingsState: { value: unknown } = { value: undefined };
vi.mock("convex/react", () => ({
  useQuery: () => settingsState.value,
  useMutation: () => vi.fn(),
}));

import ThreadLengthForm from "./ThreadLengthForm";

describe("savedPostCount", () => {
  it("is the saved length for 2 to 12, and undefined (the story frame decides) for unset or 0", () => {
    expect(savedPostCount(6)).toBe(6);
    expect(savedPostCount(12)).toBe(12);
    expect(savedPostCount(0)).toBeUndefined();
    expect(savedPostCount(undefined)).toBeUndefined();
    expect(savedPostCount(null)).toBeUndefined();
  });
});

describe("the saved default and what is sent to the model", () => {
  it("sends nothing when the pick equals the effective default, so the server applies the saved one", () => {
    expect(postCountToSend(null, 6)).toBeUndefined();
    expect(postCountToSend(6, 6)).toBeUndefined();
  });

  it("sends a pick that differs from the saved default, even when it equals the frame's own count", () => {
    const frameDefault = defaultPostCount(4);
    const saved = 6;
    expect(postCountToSend(frameDefault, saved)).toBe(4);
    expect(postCountToSend(9, saved)).toBe(9);
  });
});

describe("Posts control with a saved default", () => {
  const base = { value: 4, steps: 4, disabled: false, onChange: () => {} };

  it("with no default saved, offers to make the shown count the default and explains the frame", () => {
    const out = renderToStaticMarkup(<PostsControl {...base} onMakeDefault={() => {}} onClearDefault={() => {}} />);
    expect(out).toContain("Make 4 my default");
    expect(out).toContain(postsHelper(4));
    expect(out).not.toContain("Let the story frame decide");
  });

  it("shows the saved default in the helper and lets the founder go back to the frame", () => {
    const out = renderToStaticMarkup(<PostsControl {...base} value={6} saved={6} onMakeDefault={() => {}} onClearDefault={() => {}} />);
    expect(out).toContain("Your default is 6 posts");
    expect(out).toContain("Let the story frame decide");
    expect(out).not.toContain("Make 6 my default");
  });

  it("offers to replace the saved default when another count is shown", () => {
    const out = renderToStaticMarkup(<PostsControl {...base} value={8} saved={6} onMakeDefault={() => {}} onClearDefault={() => {}} />);
    expect(out).toContain("Make 8 my default");
  });
});

describe("Settings: thread length", () => {
  it("follows the story frame until a length is saved", () => {
    settingsState.value = { voice: {} };
    const out = renderToStaticMarkup(<ThreadLengthForm />);
    expect(out).toContain("Follow the story frame");
    expect(out).toMatch(/<option value="0" selected/);
    expect(out).toContain("12 posts");
    expect(out).toContain("up to 25");
  });

  it("shows the saved length", () => {
    settingsState.value = { voice: { defaultPostCount: 7 } };
    expect(renderToStaticMarkup(<ThreadLengthForm />)).toMatch(/<option value="7" selected/);
  });

  it("shows a loading line before settings arrive", () => {
    settingsState.value = undefined;
    expect(renderToStaticMarkup(<ThreadLengthForm />)).toContain("Loading thread length");
  });
});
