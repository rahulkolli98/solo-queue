import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AttachMediaDialog from "@/components/features/studio/AttachMediaDialog";
import MediaPanel from "@/components/features/studio/MediaPanel";
import BlogPanel from "@/components/features/studio/BlogPanel";
import GenerationErrorCard from "@/components/features/studio/GenerationErrorCard";
import IgPanel from "@/components/features/studio/IgPanel";
import StudioBottomBar from "@/components/features/studio/StudioBottomBar";
import { GenerateButton, StudioToolbar } from "@/components/features/studio/StudioActions";
import ThreadsColumn from "@/components/features/studio/ThreadsColumn";
import type { DraftView, GenState } from "@/components/features/studio/types";
import type { MediaActions } from "@/components/features/studio/useMediaActions";
import { barSummary, type Asset, type Draft, type Readiness } from "@/lib/studioModel";

const asset = (a: Record<string, unknown>) => ({ _id: "m1", ...a }) as unknown as Asset;
const html = (node: React.ReactElement) => renderToStaticMarkup(node);

const idle: GenState = { writing: false, error: null, elapsed: "0:00", onRetry: vi.fn(), retrying: false };
const ready: Readiness = { state: "ready", overBy: 0, reason: "" };
const media: MediaActions = {
  busy: null,
  error: null,
  clearError: vi.fn(),
  attach: vi.fn(),
  verify: vi.fn(),
};

function view(body: string, extra: Partial<Draft> = {}): DraftView {
  return {
    draft: { _id: "d1", templateVersion: 3, ...extra } as unknown as Draft,
    body,
    onChange: vi.fn(),
    onBlur: vi.fn(),
  };
}

describe("ThreadsColumn", () => {
  const beats = [{ label: "Hook" }, { label: "Tension" }];

  it("numbers the posts with the frame's beat label and an N / 500 counter", () => {
    const out = html(
      <ThreadsColumn
        view={view("Last month my scheduler charged me.\n---\nIt runs on a third-party API.")}
        beats={beats}
        frameName="Confession"
        readiness={ready}
        target="THU 15 OCT · 09:30"
        gen={idle}
        placeholders={["Hook"]}
        emptyCopy="x"
      />
    );
    expect(out).toContain("HOOK · 35 / 500");
    expect(out).toContain("TENSION · 29 / 500");
    expect(out).toContain("2-POST THREAD");
    expect(out).toContain("→ THU 15 OCT · 09:30");
    expect(out).toContain("V3 · CONFESSION");
    expect(out).not.toContain("Punchier");
    expect(out).not.toContain("Rewrite");
  });

  it("shows over by N with Trim to fit and Split in 2, and says the queue is blocked", () => {
    const out = html(
      <ThreadsColumn
        view={view(`short\n---\n${"x".repeat(538)}`)}
        beats={beats}
        readiness={{ state: "over", overBy: 38, reason: "OVER LIMIT" }}
        gen={idle}
        placeholders={[]}
        emptyCopy="x"
      />
    );
    expect(out).toContain("538 / 500 · OVER BY 38");
    expect(out).toContain("Trim to fit");
    expect(out).toContain("Split in 2");
    expect(out).toContain("1 POST OVER THE LIMIT");
    expect(out).toContain("QUEUE BLOCKED FOR THIS THREAD");
  });

  it("counts an emoji as one character", () => {
    const out = html(
      <ThreadsColumn
        view={view("a🙂b")}
        beats={beats}
        readiness={ready}
        gen={idle}
        placeholders={[]}
        emptyCopy="x"
      />
    );
    expect(out).toContain("HOOK · 3 / 500");
  });

  it("falls back to POST n when the frame has fewer beats", () => {
    const out = html(
      <ThreadsColumn
        view={view("a\n---\nb\n---\nc")}
        beats={beats}
        readiness={ready}
        gen={idle}
        placeholders={[]}
        emptyCopy="x"
      />
    );
    expect(out).toContain("POST 3 · 1 / 500");
  });

  it("draws one skeleton per post and a progress line while writing", () => {
    const out = html(
      <ThreadsColumn
        beats={beats}
        readiness={{ state: "missing", overBy: 0, reason: "NOT WRITTEN" }}
        gen={{ ...idle, writing: true, elapsed: "0:12" }}
        placeholders={["Hook", "Tension", "Turn"]}
        emptyCopy="x"
      />
    );
    expect(out).toContain('aria-busy="true"');
    expect(out).toContain("WRITING THE THREAD…");
    expect(out).toContain("0:12 ELAPSED");
    expect(out.match(/studio-skel"/g)).toHaveLength(2);
  });

  it("shows the error card with Retry and Write it myself when the model failed", () => {
    const out = html(
      <ThreadsColumn
        readiness={{ state: "missing", overBy: 0, reason: "NOT WRITTEN" }}
        gen={{ ...idle, error: "The writing model timed out." }}
        placeholders={[]}
        emptyCopy="x"
      />
    );
    expect(out).toContain("Couldn&#x27;t write the thread");
    expect(out).toContain("The writing model timed out.");
    expect(out).toContain("Retry");
    expect(out).toContain("Write it myself");
  });

  it("lists the dashed beat boxes before anything is written", () => {
    const out = html(
      <ThreadsColumn
        readiness={{ state: "missing", overBy: 0, reason: "NOT WRITTEN" }}
        gen={idle}
        placeholders={["Hook", "Tension"]}
        emptyCopy="Generate and the thread lands here."
      />
    );
    expect(out).toContain("1 · HOOK");
    expect(out).toContain("2 · TENSION");
    expect(out).toContain("Generate and the thread lands here.");
  });

  it("marks a queued thread with its slot", () => {
    const out = html(
      <ThreadsColumn
        view={view("one")}
        readiness={{ state: "queued", overBy: 0, reason: "" }}
        queuedWhen="THU 15 OCT · 09:30"
        gen={idle}
        placeholders={[]}
        emptyCopy="x"
      />
    );
    expect(out).toContain("QUEUED → THU 15 OCT · 09:30");
  });
});

const igBase = {
  readiness: ready,
  mediaState: "none" as const,
  asset: undefined,
  media,
  onAttach: vi.fn(),
  gen: idle,
};

describe("IgPanel", () => {
  it("blocks a reel with no media: MEDIA REQUIRED and Attach media", () => {
    const out = html(
      <IgPanel
        {...igBase}
        kind="reel"
        readiness={{ state: "media_required", overBy: 0, reason: "MEDIA MISSING" }}
        view={view("1. 0:00–0:02 — On screen: hi\n2. 0:02–0:08 — VO: there")}
      />
    );
    expect(out).toContain("MEDIA REQUIRED");
    expect(out).toContain("Attach media");
    expect(out).toContain("0:00–0:02");
    expect(out).toContain("Edit script");
  });

  it("offers Verify when the attached media is unverified", () => {
    const a = asset({ mimeType: "image/png", publicUrl: "https://x.test/a.png", filename: "a.png" });
    const out = html(
      <IgPanel {...igBase} kind="caption" mediaState="unverified" asset={a} view={view("A caption")} />
    );
    expect(out).toContain("NOT CHECKED YET");
    expect(out).toContain("Check");
    expect(out).toContain("Detach");
  });

  it("shows the caption counter against 2,200 and the over state", () => {
    const out = html(
      <IgPanel
        {...igBase}
        kind="caption"
        mediaState="ok"
        readiness={{ state: "over", overBy: 50, reason: "OVER LIMIT" }}
        asset={asset({ mimeType: "image/png", publicUrl: "https://x.test/a.png", verifiedAt: 1 })}
        view={view("x".repeat(2250))}
      />
    );
    expect(out).toContain("CAPTION · 2,250 / 2,200");
    expect(out).toContain("OVER BY 50");
    expect(out).toContain("Trim to fit");
  });

  it("shows the target slot and what it fills", () => {
    const out = html(
      <IgPanel
        {...igBase}
        kind="reel"
        mediaState="ok"
        asset={asset({ mimeType: "video/mp4", publicUrl: "https://x.test/a.mp4", verifiedAt: 1 })}
        target={{ when: "SAT 10 OCT · 18:30", gap: true }}
        view={view("1. 0:00–0:02 — On screen: hi")}
      />
    );
    expect(out).toContain("→ SAT 10 OCT · 18:30 · FILLS GAP");
  });
});

describe("GenerationErrorCard", () => {
  it("is an alert with Retry and Write it myself", () => {
    const out = html(
      <GenerationErrorCard title="Couldn't write the reel script" message="Timed out." onRetry={vi.fn()} onWriteMyself={vi.fn()} />
    );
    expect(out).toContain('role="alert"');
    expect(out).toContain("Retry");
    expect(out).toContain("Write it myself");
    expect(out).toContain("saved");
  });
});

describe("StudioBottomBar", () => {
  const slot = (day: string, time: string, gap: boolean) => ({
    dayKey: day,
    dayLabel: day,
    platform: "instagram" as const,
    time,
    gap,
    when: `${day} OCT · ${time}`,
  });

  it("shows the count, slot chips with gap rings and the primary Queue button", () => {
    const summary = barSummary({
      states: { threads: ready, caption: ready, reel: ready },
      generating: false,
      emptySub: "",
    });
    const out = html(
      <StudioBottomBar
        summary={summary}
        slots={[slot("SAT 10", "18:30", true), slot("SUN 11", "12:00", false)]}
        slotsLoading={false}
        blogChecked={false}
        blogLocked={false}
        onBlog={vi.fn()}
        onQueue={vi.fn()}
        queuing={false}
      />
    );
    expect(out).toContain("3 drafts ready");
    expect(out).toContain("IG 18:30");
    expect(out).toContain('data-gap="true"');
    expect(out).toContain("+ blog draft");
    expect(out).toContain("Queue 3 posts");
    expect(out).not.toMatch(/Queue 3 posts[\s\S]*disabled/);
  });

  it("disables Queue and says x of y ready while generating", () => {
    const summary = barSummary({
      states: { threads: ready },
      generating: true,
      progress: { done: 1, total: 3 },
      emptySub: "",
    });
    const out = html(
      <StudioBottomBar
        summary={summary}
        slots={[]}
        slotsLoading={false}
        blogChecked={false}
        blogLocked={false}
        onBlog={vi.fn()}
        onQueue={vi.fn()}
        queuing={false}
      />
    );
    expect(out).toContain("Generating…");
    expect(out).toContain("1 OF 3 DRAFTS READY");
    expect(out).toContain("disabled");
    expect(out).toContain("NO OPEN SLOTS IN THE NEXT 2 WEEKS");
  });
});

describe("BlogPanel", () => {
  it("offers Copy markdown and Download .md with the draft tabs", () => {
    const out = html(
      <BlogPanel
        view={view("# Title\n\nSome words here.")}
        topicTitle="A topic"
        threadsCount={4}
        onTab={vi.fn()}
        gen={idle}
        writing={false}
        onWrite={vi.fn()}
      />
    );
    expect(out).toContain("Copy markdown");
    expect(out).toContain("Download .md");
    expect(out).toContain("Threads · 4");
    expect(out).toContain("IG reel");
    expect(out).toContain("IG caption");
    expect(out).toContain("5 WORDS");
    expect(out).toContain("NOT POSTED");
  });

  it("disables the exports and offers to write the draft when there is none", () => {
    const out = html(
      <BlogPanel topicTitle="A topic" threadsCount={0} onTab={vi.fn()} gen={idle} writing={false} onWrite={vi.fn()} />
    );
    expect(out).toContain("Write the blog draft");
    expect(out).toMatch(/<button[^>]*disabled[^>]*>Copy markdown/);
  });
});

describe("Studio toolbar and generate button", () => {
  it("labels Generate, Regenerate and running (replacing is confirmed separately, not by a second tap)", () => {
    const base = { onGenerate: vi.fn() };
    expect(html(<GenerateButton {...base} hasDrafts={false} running={false} />)).toContain("Generate drafts");
    expect(html(<GenerateButton {...base} hasDrafts running={false} />)).toContain("Regenerate all");
    expect(html(<GenerateButton {...base} hasDrafts running />)).toContain("Generating…");
    expect(html(<GenerateButton {...base} hasDrafts running={false} />)).not.toContain("Tap again");
  });

  it("has a polite save status and both view switches", () => {
    const out = html(
      <StudioToolbar
        saveText="Saved 14:32"
        saveFailed={false}
        onRetrySave={vi.fn()}
        pane="threads"
        onPane={vi.fn()}
        counts={{ threads: 4, instagram: 2 }}
      />
    );
    expect(out).toContain('aria-live="polite"');
    expect(out).toContain("SAVED 14:32");
    expect(out).toContain("Threads + Instagram");
    expect(out).toContain("Instagram");
    expect(out).toContain("Blog");
  });
});

describe("media on a card (Studio panel and attach dialog)", () => {
  const NOW = 1_800_000_000_000;
  const HOUR = 3600 * 1000;
  const img = (over: Record<string, unknown>) =>
    asset({
      mimeType: "image/jpeg",
      publicUrl: "https://picsum.photos/200/300.jpg",
      filename: "300.jpg",
      source: "external",
      createdAt: NOW - 5 * HOUR,
      ...over,
    });
  const panel = (a: Asset, state: "ok" | "stale" | "unverified") =>
    html(<MediaPanel kind="caption" draftId="d1" asset={a} state={state} media={media} onAttach={vi.fn()} />);
  const dialog = (assets: Asset[]) =>
    html(
      <AttachMediaDialog
        open
        onClose={vi.fn()}
        assets={assets as (Asset & { createdAt: number })[]}
        draftId="d1"
        currentAssetId={undefined}
        forLabel="Caption"
        now={NOW}
        media={media}
      />
    );

  it("panel: a verified image reads READY FOR INSTAGRAM with a preview, name, host and type", () => {
    const out = panel(img({ verifiedAt: Date.now() - 3 * HOUR }), "ok");
    expect(out).toContain("READY FOR INSTAGRAM");
    expect(out).toContain('alt="Preview of 300.jpg"');
    expect(out).toContain("IMAGE · picsum.photos");
    expect(out).toContain("Open file");
    expect(out).not.toContain("Recheck");
  });

  it("panel: a refused link reads NOT A MEDIA FILE with the whole reason and the next step", () => {
    const reason = "That link is a text/html page, not an image or video file. Upload the file instead.";
    const out = panel(img({ lastVerifyError: reason }), "unverified");
    expect(out).toContain("NOT A MEDIA FILE");
    expect(out).toContain(reason);
    expect(out).toContain("Upload the file instead.");
    expect(out).toContain("Can&#x27;t load preview");
    expect(out).toContain("Recheck");
  });

  it("panel: never-checked reads NOT CHECKED YET with a Check button; stale reads CHECK AGAIN SOON", () => {
    const fresh = panel(img({}), "unverified");
    expect(fresh).toContain("NOT CHECKED YET");
    expect(fresh).toContain(">Check<");
    const stale = panel(img({ verifiedAt: Date.now() - 30 * HOUR }), "stale");
    expect(stale).toContain("CHECK AGAIN SOON");
    expect(stale).toContain("Recheck");
  });

  it("dialog: every card shows preview, name, host, type and a worded state", () => {
    const out = dialog([
      img({ _id: "a", verifiedAt: NOW - 3 * HOUR }),
      img({ _id: "b", mimeType: "video/mp4", filename: "clip.mp4", source: "upload", verifiedAt: NOW - HOUR }),
      img({ _id: "c", publicUrl: "https://youtu.be/x", filename: "x", lastVerifyError: "That link is a text/html page, not a file." }),
      img({ _id: "d" }),
      img({ _id: "e", verifiedAt: NOW - 30 * HOUR }),
    ]);
    expect(out).toContain("READY FOR INSTAGRAM");
    expect(out).toContain("checked 3 h ago");
    expect(out).toContain("<video");
    expect(out).toContain("VIDEO · Uploaded");
    expect(out).toContain("NOT A MEDIA FILE");
    expect(out).toContain("That link is a text/html page, not a file.");
    expect(out).toContain("NOT CHECKED YET");
    expect(out).toContain("CHECK AGAIN SOON");
    expect(out).toContain("Open file");
  });
});
