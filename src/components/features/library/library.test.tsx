import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { FrameDefaultToggles } from "./FrameDefaultToggles";
import FrameEditor from "./FrameEditor";
import FramesTab from "./FramesTab";
import LibraryRail, { FramesStrip } from "./LibraryRail";
import LibraryTopbar from "./LibraryTopbar";
import MediaTab, { MediaTile } from "./MediaTab";
import MediaThumb from "./MediaThumb";
import type { Frame, LibraryFilters, MediaAsset, Pillar, Voice } from "./types";

const { useQueryMock, searchParams } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  searchParams: { value: "" },
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(searchParams.value) }));
vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }) }));

const pillars: Pillar[] = [
  { key: "build", name: "Build in public", color: "pillar-build", description: "", targetShare: 40, links: [] },
];
const filters: LibraryFilters = { search: "", pillar: "", platform: "", topicId: "", format: "", sort: "newest" };

function frame(over: Partial<Frame>): Frame {
  return {
    _id: "f1",
    _creationTime: 0,
    key: "confession",
    name: "Confession",
    beats: [{ label: "Admit", hint: "" }, { label: "Cost", hint: "" }],
    fits: ["thread"],
    color: "pillar-build",
    usedCount: 9,
    version: 1,
    isActive: true,
    createdAt: 0,
    ...over,
  } as Frame;
}

describe("LibraryTopbar", () => {
  const bar = (tab: "published" | "drafts" | "frames" | "media") =>
    renderToStaticMarkup(
      <LibraryTopbar
        tab={tab}
        counts={{ published: 46, drafts: 12, frames: 6, media: 31 }}
        filters={filters}
        onFilters={() => {}}
        pillars={pillars}
      />
    );

  it("builds the tabs as links to real routes with live counts", () => {
    const out = bar("published");
    expect(out).toContain('href="/library"');
    expect(out).toContain('href="/library/drafts"');
    expect(out).toContain('href="/library/frames"');
    expect(out).toContain('href="/library/media"');
    expect(out).toContain(">46<");
    expect(out).toContain(">12<");
    expect(out).toContain(">31<");
  });

  it("marks only the current tab", () => {
    const out = bar("drafts");
    expect(out.match(/aria-current="page"/g)).toHaveLength(1);
    expect(out).toMatch(/href="\/library\/drafts"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/library\/drafts"/);
  });

  it("shows the pillar and platform filters on Published and Drafts only", () => {
    expect(bar("published")).toContain("Pillar · All");
    expect(bar("drafts")).toContain("Platform · Both");
    expect(bar("frames")).not.toContain("Pillar · All");
    expect(bar("media")).not.toContain("Platform · Both");
  });
});

describe("LibraryRail", () => {
  it("lists frames with their beats and use counts, the voice and New frame", () => {
    const out = renderToStaticMarkup(
      <LibraryRail frames={[frame({})]} voice="Dry founder." learnedFrom={12} />
    );
    expect(out).toContain("Confession");
    expect(out).toContain("ADMIT → COST · USED 9×");
    expect(out).toContain("Dry founder.");
    expect(out).toContain("LEARNED FROM 12 OF YOUR POSTS");
    expect(out).toContain('href="/library/frames?frame=new"');
    expect(out).not.toContain("Drafts by status");
  });

  it("adds the drafts-by-status block on Drafts", () => {
    const out = renderToStaticMarkup(
      <LibraryRail frames={[]} voice="x" learnedFrom={0} summary={{ fixing: 3, saved: 8, blog: 1 }} />
    );
    expect(out).toContain("Drafts by status");
    expect(out).toContain("Need fixing");
    expect(out).toContain("Blog drafts, never posted");
  });

  it("renders the phone strip only when there are frames", () => {
    expect(renderToStaticMarkup(<FramesStrip frames={[]} />)).toBe("");
    expect(renderToStaticMarkup(<FramesStrip frames={[frame({})]} />)).toContain("SWIPE");
  });
});

const NOW = 1_800_000_000_000;
const HOUR = 3600 * 1000;

function asset(over: Partial<MediaAsset>): MediaAsset {
  return {
    _id: "m1",
    _creationTime: 0,
    storageId: "external:https://picsum.photos/200/300.jpg",
    publicUrl: "https://picsum.photos/200/300.jpg",
    mimeType: "image/jpeg",
    filename: "300.jpg",
    source: "external",
    createdAt: NOW - 5 * HOUR,
    usedBy: 0,
    ...over,
  } as MediaAsset;
}

const tile = (a: MediaAsset, checking = false) =>
  renderToStaticMarkup(<MediaTile asset={a} index={0} checking={checking} now={NOW} onVerify={vi.fn()} />);

describe("MediaTile states", () => {
  it("READY FOR INSTAGRAM: preview, name, host, type, how long ago, Open file / Recheck / Remove", () => {
    const out = tile(asset({ verifiedAt: NOW - 3 * HOUR }));
    expect(out).toContain("READY FOR INSTAGRAM");
    expect(out).toContain("checked 3 h ago");
    expect(out).toContain('<img src="https://picsum.photos/200/300.jpg" alt="Preview of 300.jpg"');
    expect(out).toContain("300.jpg");
    expect(out).toContain("IMAGE · picsum.photos");
    expect(out).toContain("Open file");
    expect(out).toContain('href="https://picsum.photos/200/300.jpg"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain("Recheck");
    expect(out).toContain("Remove");
    expect(out).not.toContain("Watch");
    expect(out).not.toContain("verified: true");
    expect(out).not.toContain("Upload the file instead");
  });

  it("an uploaded video shows a muted first-frame preview with a play badge and says Uploaded", () => {
    const out = tile(
      asset({ mimeType: "video/mp4", filename: "clip.mp4", source: "upload", publicUrl: "http://127.0.0.1:3211/api/storage/x", verifiedAt: NOW - 60000 })
    );
    expect(out).toContain("<video");
    expect(out).toContain('preload="metadata"');
    expect(out).toContain("muted");
    expect(out).toContain("mthumb-play");
    expect(out).toContain("VIDEO · Uploaded");
    expect(out).toContain("READY FOR INSTAGRAM");
  });

  it("NOT A MEDIA FILE: the full reason, the next step, a Can't load preview state, and no load attempt", () => {
    const reason =
      "That link is a text/html page, not an image or video file. Instagram needs a direct link to the file itself (ends in .jpg, .png, .mp4 ...), so upload the file instead.";
    const out = tile(
      asset({ publicUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", filename: "watch", lastVerifyError: reason })
    );
    expect(out).toContain("NOT A MEDIA FILE");
    expect(out).toContain(reason);
    expect(out).toContain("Upload the file instead.");
    expect(out).toContain("Can&#x27;t load preview");
    expect(out).not.toContain("<img");
    expect(out).toContain("IMAGE · youtube.com");
    expect(out).toContain("Recheck");
    expect(out).toContain("Open file");
  });

  it("NOT CHECKED YET: offers a Check button", () => {
    const out = tile(asset({}));
    expect(out).toContain("NOT CHECKED YET");
    expect(out).toContain(">Check<");
    expect(out).not.toContain("Recheck");
  });

  it("CHECK AGAIN SOON: verified but older than the 24 h freshness window", () => {
    const out = tile(asset({ verifiedAt: NOW - 30 * HOUR }));
    expect(out).toContain("CHECK AGAIN SOON");
    expect(out).toContain("checked 1 d ago");
    expect(out).toContain("Recheck");
  });

  it("says CHECKING while a check runs, and shows how many drafts use the file", () => {
    const out = tile(asset({ usedBy: 2, verifiedAt: NOW - HOUR }), true);
    expect(out).toContain("CHECKING");
    expect(out).toContain("USED 2×");
    expect(out).not.toContain("READY FOR INSTAGRAM");
  });
});

describe("MediaThumb", () => {
  it("renders an image with alt text, and the failure state when asked to skip loading", () => {
    const a = { publicUrl: "https://x.test/a.png", mimeType: "image/png" };
    expect(renderToStaticMarkup(<MediaThumb asset={a} name="a.png" />)).toContain('alt="Preview of a.png"');
    const broken = renderToStaticMarkup(<MediaThumb asset={a} name="a.png" broken />);
    expect(broken).toContain("Can&#x27;t load preview");
    expect(broken).toContain('role="img"');
    expect(broken).toContain("Can&#x27;t load preview of a.png");
  });
});

describe("MediaTab add by URL", () => {
  it("says up front that only direct image or video file links work", () => {
    useQueryMock.mockReturnValue([asset({ verifiedAt: NOW - HOUR })]);
    const out = renderToStaticMarkup(
      <MediaTab filters={filters} tz="UTC" frames={[]} voice="" learnedFrom={0} />
    );
    expect(out).toContain(
      "Paste a direct link to an image or video file (ends in .jpg, .png, .mp4 ...). YouTube, Vimeo and Google Drive page links will not work. Upload the file instead."
    );
    expect(out).toContain('aria-describedby="lb-url-help"');
    expect(out).toContain("READY FOR INSTAGRAM");
  });
});

// ---------- story frames: defaults per format ----------

const voice = (over: Partial<Voice> = {}): Voice =>
  ({ description: "", learnedFromCount: 0, defaultFrameKey: "confession", bannedWords: [], ...over }) as Voice;

const FRAMES = [
  frame({ key: "confession", name: "Confession", fits: ["thread"] }),
  frame({ key: "hot-take", name: "Hot take", fits: ["thread", "single"] }),
  frame({ key: "ig-reel", name: "IG reel", fits: ["reel"] }),
  frame({ key: "slides", name: "Slides", fits: ["carousel"] }),
];

function framesTab(param: string, v: Voice | undefined, frames: Frame[] = FRAMES) {
  searchParams.value = param ? `frame=${param}` : "";
  return renderToStaticMarkup(<FramesTab filters={filters} pillars={pillars} frames={frames} voice={v} />);
}

/** The opening tag of the button with this exact text, or null. */
function button(out: string, label: string): string | null {
  const m = new RegExp(`<button[^>]*>${label}</button>`).exec(out);
  return m ? m[0] : null;
}

const countOf = (out: string, text: string) => out.split(text).length - 1;

describe("FramesTab opens a saved carousel frame with its style note", () => {
  it("loads the style text into the editor, so saving the frame does not clear it", () => {
    const withStyle = frame({ key: "slides", name: "Slides", fits: ["carousel"], style: "Short bold headlines. Dry, no hype." } as Partial<Frame>);
    const out = framesTab("slides", voice(), [FRAMES[0], withStyle]);
    expect(out).toContain("Short bold headlines. Dry, no hype.");
    expect(out).toContain("Style and references");
  });
});

describe("FramesTab default chips", () => {
  it("shows one DEFAULT · FORMAT chip per format the frame is the effective default for", () => {
    const out = framesTab("confession", voice({ formatDefaults: { caption: { frameKey: "hot-take" } } }));
    // confession: the older default, for Threads. hot-take: the saved Caption pick. ig-reel: the seeded Reel frame.
    expect(countOf(out, "DEFAULT · THREADS")).toBe(1);
    expect(countOf(out, "DEFAULT · CAPTION")).toBe(1);
    expect(countOf(out, "DEFAULT · REEL SCRIPT")).toBe(1);
    expect(out).not.toContain("DEFAULT · CAROUSEL");
    expect(out).toContain('class="lb-pill lb-pill-ink">DEFAULT · THREADS');
  });

  it("gives a frame that is the default for two formats two chips", () => {
    const out = framesTab(
      "slides",
      voice({ formatDefaults: { threads: { frameKey: "hot-take" }, caption: { frameKey: "hot-take" } } })
    );
    const card = out.split("Hot take</span>")[1].split("</button>")[0];
    expect(card).toContain("DEFAULT · THREADS");
    expect(card).toContain("DEFAULT · CAPTION");
  });

  it("keeps the existing card markup (used count, fits line, beat chain)", () => {
    const out = framesTab("slides", voice());
    expect(out).toContain("USED 9×");
    expect(out).toContain("FITS · THREADS THREAD · SINGLE");
    expect(out).toContain("ADMIT → COST");
    expect(out).toContain("EDITING");
    expect(out).toContain("Learn from a post");
    expect(out).not.toContain("COMING LATER");
  });

  it("shows no chips while the settings are loading", () => {
    expect(framesTab("slides", undefined)).not.toContain("DEFAULT ·");
  });
});

describe("frame editor: Default for toggles", () => {
  it("is on for the formats this frame is the effective default for, off for the rest", () => {
    const out = framesTab("hot-take", voice({ formatDefaults: { caption: { frameKey: "hot-take" } } }));
    expect(out).toContain("Default for");
    expect(button(out, "Caption")).toContain('aria-pressed="true"');
    expect(button(out, "Caption")).not.toContain("disabled");
    expect(button(out, "Threads")).toContain('aria-pressed="false"');
    expect(button(out, "Threads")).not.toContain("disabled");
    // a frame that does not fit a format offers no toggle for it
    expect(button(out, "Reel script")).toBeNull();
    expect(button(out, "Carousel")).toBeNull();
  });

  it("disables a toggle that is on only through the older default and says how to change it", () => {
    const out = framesTab("confession", voice());
    expect(button(out, "Threads")).toContain('aria-pressed="true"');
    expect(button(out, "Threads")).toContain("disabled");
    expect(out).toContain("Pick another frame as the default to change this.");
  });

  it("lets a saved pick be turned off, with no older-default note", () => {
    const out = framesTab("hot-take", voice({ formatDefaults: { threads: { frameKey: "hot-take" } } }));
    expect(button(out, "Threads")).toContain('aria-pressed="true"');
    expect(button(out, "Threads")).not.toContain("disabled");
    expect(out).not.toContain("Pick another frame as the default to change this.");
  });

  it("is on for a carousel frame only when it is the saved carousel default", () => {
    expect(button(framesTab("slides", voice()), "Carousel")).toContain('aria-pressed="false"');
    const on = framesTab("slides", voice({ formatDefaults: { carousel: { frameKey: "slides" } } }));
    expect(button(on, "Carousel")).toContain('aria-pressed="true"');
    expect(countOf(on, "DEFAULT · CAROUSEL")).toBe(1);
  });

  it("disables the toggles for a new unsaved frame and says to save first", () => {
    const out = framesTab("new", voice());
    expect(out).toContain("Save the frame first.");
    const toggles = out.split('id="lb-defaults-title"')[1];
    expect(button(toggles, "Threads")).toContain("disabled");
    expect(button(toggles, "Threads")).toContain('aria-pressed="false"');
  });

  it("disables the toggles while the settings load", () => {
    const out = framesTab("hot-take", undefined);
    expect(button(out, "Threads")).toContain("disabled");
    expect(button(out, "Caption")).toContain("disabled");
  });

  it("shows the save error readably", () => {
    const out = renderToStaticMarkup(
      <FrameDefaultToggles
        toggles={[{ kind: "threads", label: "Threads", on: false, inherited: false }]}
        unsaved={false}
        busy={false}
        error="voice: formatDefaults is not valid."
        onToggle={() => {}}
      />
    );
    expect(out).toContain('role="alert"');
    expect(out).toContain("voice: formatDefaults is not valid.");
  });

  it("turns on a toggle that is off and off a toggle that is on", () => {
    const onToggle = vi.fn();
    const tree = FrameDefaultToggles({
      toggles: [
        { kind: "threads", label: "Threads", on: true, inherited: false },
        { kind: "caption", label: "Caption", on: false, inherited: false },
      ],
      unsaved: false,
      busy: false,
      error: null,
      onToggle,
    });
    type El = ReactElement<{ onClick?: () => void; children?: ReactNode }>;
    const buttons: El[] = [];
    (function walk(node: ReactNode) {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object" || !("props" in node)) return;
      const el = node as El;
      if (el.type === "button") buttons.push(el);
      walk(el.props.children);
    })(tree);
    buttons[0].props.onClick?.();
    buttons[1].props.onClick?.();
    expect(onToggle).toHaveBeenNthCalledWith(1, "threads", false);
    expect(onToggle).toHaveBeenNthCalledWith(2, "caption", true);
  });
});

describe("new frame: choose the format first", () => {
  it("offers Threads, Caption, Reel script and Carousel with Threads pre-selected", () => {
    const out = framesTab("new", voice());
    expect(out).toContain("This frame is for");
    expect(out).toContain('role="radiogroup"');
    expect(button(out, "Threads")).toContain('aria-checked="true"');
    for (const label of ["Caption", "Reel script", "Carousel"]) {
      expect(button(out, label)).toContain('role="radio"');
      expect(button(out, label)).toContain('aria-checked="false"');
    }
    expect(button(out, "THREAD")).toContain('aria-pressed="true"');
    expect(out).toContain("Each beat is one post in the thread.");
  });

  it("does not offer the choice when editing a saved frame", () => {
    expect(framesTab("hot-take", voice())).not.toContain("This frame is for");
  });

  const editor = (fits: Frame["fits"], key: string | null = null, style?: string) =>
    renderToStaticMarkup(
      <FrameEditor
        initial={{
          key,
          name: "",
          beats: [{ label: "", hint: "" }, { label: "", hint: "" }],
          fits,
          color: "pillar-build",
          style,
        }}
        usedCount={0}
        takenKeys={[]}
        colors={["pillar-build"]}
        frames={FRAMES}
        voice={voice()}
        onSaved={() => {}}
        onDuplicate={() => {}}
      />
    );

  it("a carousel frame says each beat is one slide and starts with the carousel fit", () => {
    const out = editor(["carousel"]);
    expect(button(out, "Carousel")).toContain('aria-checked="true"');
    expect(button(out, "THREAD")).toContain('aria-pressed="false"');
    expect(button(out, "CAROUSEL")).toContain('aria-pressed="true"');
    expect(out).toContain("Each beat is one slide.");
  });

  it("a caption or reel frame words the hint for it", () => {
    expect(editor(["single"])).toContain("Each beat is one part of the caption.");
    expect(editor(["reel"])).toContain("Each beat is one moment of the script.");
  });

  describe("style and references", () => {
    it("shows the field, its helper text and a zero count only for a frame that fits a carousel", () => {
      const out = editor(["carousel"]);
      expect(out).toContain("Style and references");
      expect(out).toContain("<textarea");
      expect(out).toContain(
        "How the carousel should look and sound: tone, example carousels you like (describe them), things to avoid. Optional."
      );
      expect(out).toContain("0 / 2,000");
      expect(editor(["thread", "carousel"])).toContain("Style and references");
    });

    it("hides the field for a frame that does not fit a carousel", () => {
      for (const fits of [["thread"], ["single"], ["reel"], ["thread", "reel"]] as Frame["fits"][]) {
        const out = editor(fits, null, "Short bold headlines.");
        expect(out).not.toContain("Style and references");
        expect(out).not.toContain("<textarea");
        expect(out).not.toContain("/ 2,000");
      }
    });

    it("loads the saved note and counts it", () => {
      const out = editor(["carousel"], "ig-carousel", "Short bold headlines.");
      expect(out).toContain("Short bold headlines.");
      expect(out).toContain("21 / 2,000");
      expect(out).not.toContain("The style notes can be up to");
    });

    it("a saved frame can be deleted, a starter frame is hidden instead, and a new frame has neither button", () => {
      const custom = editor(["thread"], "my-own-frame");
      expect(custom).toContain(">Delete<");
      expect(custom).not.toContain("Starter frames are hidden");
      const starter = editor(["thread"], "confession");
      expect(starter).toContain(">Hide<");
      expect(starter).toContain("Starter frames are hidden, not erased");
      const fresh = editor(["thread"]);
      expect(fresh).not.toContain(">Delete<");
      expect(fresh).not.toContain(">Hide<");
    });

    it("keeps working for a saved frame that has no style", () => {
      const out = editor(["carousel"], "ig-carousel", undefined);
      expect(out).toContain("0 / 2,000");
    });

    it("says so, in red, when the note is over the limit", () => {
      const out = editor(["carousel"], null, "x".repeat(2001));
      expect(out).toContain("2,001 / 2,000");
      expect(out).toContain("The style notes can be up to 2,000 characters.");
      expect(out).toContain("is-over");
      expect(editor(["carousel"], null, "x".repeat(2000))).not.toContain("is-over");
    });
  });

  it("keeps the beat limits: Add beat is available below five and Remove stops at two", () => {
    const out = editor(["thread"]);
    expect(button(out, "\\+ Add beat")).not.toContain("disabled");
    expect(out).toContain('aria-label="Remove beat 1"');
    expect(out.match(/aria-label="Remove beat \d"[^>]*disabled/g)).toHaveLength(2);
  });
});
