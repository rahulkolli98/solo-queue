import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import LibraryRail, { FramesStrip } from "./LibraryRail";
import LibraryTopbar from "./LibraryTopbar";
import MediaTab, { MediaTile } from "./MediaTab";
import MediaThumb from "./MediaThumb";
import type { Frame, LibraryFilters, MediaAsset, Pillar } from "./types";

const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }));
vi.mock("convex/react", () => ({
  useQuery: useQueryMock,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }) }));

const pillars: Pillar[] = [
  { key: "build", name: "Build in public", color: "pillar-build", description: "", targetShare: 40, links: [] },
];
const filters: LibraryFilters = { search: "", pillar: "", platform: "" };

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
