import { ConvexError } from "convex/values";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import GenerationErrorCard from "@/components/features/studio/GenerationErrorCard";
import IgPanel from "@/components/features/studio/IgPanel";
import ManualDraft from "@/components/features/studio/ManualDraft";
import StudioBottomBar from "@/components/features/studio/StudioBottomBar";
import StudioGuideStrip from "@/components/features/studio/StudioGuideStrip";
import { StudioToolbar } from "@/components/features/studio/StudioActions";
import ThreadsColumn from "@/components/features/studio/ThreadsColumn";
import TopicColumn from "@/components/features/studio/TopicColumn";
import type { GenState } from "@/components/features/studio/types";
import type { MediaActions } from "@/components/features/studio/useMediaActions";
import ResearchStatus from "@/components/features/research/ResearchStatus";
import { researchFailure } from "@/lib/researchErrors";
import { refusalCode } from "@/lib/refusalText";
import { studioErrorText } from "@/lib/studioErrors";
import { barSummary, studioGuide, studioHomeGuide, type Readiness } from "@/lib/studioModel";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const missing: Readiness = { state: "missing", overBy: 0, reason: "NOT WRITTEN" };
const media: MediaActions = { busy: null, error: null, clearError: vi.fn(), attach: vi.fn(), verify: vi.fn() };

/** What the hook turns a thrown refusal into, so the screens are tested with the real text path. */
function failed(code: string, message: string): GenState {
  const err = new ConvexError(`VALIDATION:${code}: ${message}`);
  return {
    writing: false,
    error: studioErrorText(err, "Generation failed."),
    errorCode: refusalCode(err),
    elapsed: "0:00",
    onRetry: vi.fn(),
    retrying: false,
  };
}

const PRIVACY =
  "OpenRouter blocked this model because of your privacy settings: 0 endpoints are available matching your data policy. Change it at https://openrouter.ai/settings/privacy and try again.";

describe("guide strip", () => {
  it("shows the four steps, ticks done ones and marks the current one", () => {
    const g = studioGuide({
      generating: false,
      generationFailed: false,
      manualText: false,
      hasOpenSlot: true,
      states: {
        threads: { state: "ready", overBy: 0, reason: "" },
        caption: { state: "media_required", overBy: 0, reason: "MEDIA MISSING" },
        reel: { state: "media_required", overBy: 0, reason: "MEDIA MISSING" },
      },
    });
    const out = html(<StudioGuideStrip steps={g.steps} />);
    for (const label of ["Topic", "Drafts", "Media for Instagram", "Queue"]) expect(out).toContain(label);
    expect(out).toContain('aria-current="step"');
    expect(out.match(/aria-current="step"/g)).toHaveLength(1);
    expect(out).toContain('data-state="done"');
    expect(out).toContain("(done)");
    expect(out).toContain("(you are here)");
  });

  it("the home strip has step 1 current", () => {
    const out = html(<StudioGuideStrip steps={studioHomeGuide(false).steps} />);
    expect(out).toMatch(/data-state="current"[^>]*>(?:(?!<\/li>).)*Topic/);
  });
});

describe("bottom bar next step", () => {
  const blocked = barSummary({
    states: {
      threads: { state: "over", overBy: 40, reason: "OVER LIMIT" },
      caption: { state: "ready", overBy: 0, reason: "" },
    },
    generating: false,
    emptySub: "",
  });

  it("explains in words why Queue is disabled, next to the button", () => {
    const text = "Over the 500-character limit on post 2: use Trim to fit.";
    const out = html(
      <StudioBottomBar
        summary={{ ...blocked, canQueue: false }}
        slots={[]}
        slotsLoading={false}
        blogChecked={false}
        blogLocked={false}
        onBlog={() => {}}
        onQueue={() => {}}
        queuing={false}
        nextStep={text}
        nextTone="fix"
      />
    );
    expect(out).toContain(text);
    expect(out).toContain('data-tone="fix"');
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="studio-next-step"|<button[^>]*aria-describedby="studio-next-step"[^>]*disabled=""/);
    expect(out).toContain('id="studio-next-step"');
  });

  it("shows a visible Saved confirmation", () => {
    const out = html(
      <StudioBottomBar
        summary={{ ...blocked, canQueue: true }}
        slots={[]}
        slotsLoading={false}
        blogChecked={false}
        blogLocked={false}
        onBlog={() => {}}
        onQueue={() => {}}
        queuing={false}
        nextStep="All set: press Queue 3 posts."
        nextTone="go"
        savedText="Saved 14:32"
      />
    );
    expect(out).toContain("SAVED 14:32");
    expect(out).toContain("studio-bar-saved");
  });

  it("the toolbar ticks Saved too", () => {
    const out = html(
      <StudioToolbar
        saveText="Saved 14:32"
        saveFailed={false}
        onRetrySave={() => {}}
        pane="threads"
        onPane={() => {}}
        counts={{ threads: 4, instagram: 2 }}
        saved
      />
    );
    expect(out).toContain('data-saved="true"');
    expect(out).toContain("SAVED 14:32");
    expect(out).toContain("<svg");
  });

  it("keeps the open-slot chips as one clipped row, each with its day, time and platform", () => {
    const out = html(
      <StudioBottomBar
        summary={blocked}
        slots={[
          { dayKey: "2026-10-03", dayLabel: "SAT 3", platform: "instagram", time: "12:00", gap: true, when: "SAT 3 OCT · 12:00" },
          { dayKey: "2026-10-04", dayLabel: "SUN 4", platform: "threads", time: "09:30", gap: false, when: "SUN 4 OCT · 09:30" },
        ]}
        slotsLoading={false}
        blogChecked={false}
        blogLocked={false}
        onBlog={() => {}}
        onQueue={() => {}}
        queuing={false}
      />
    );
    expect(out).toContain("SAT 3");
    expect(out).toContain("IG 12:00");
    expect(out).toContain("TH 09:30");
  });
});

describe("generation errors show the backend's words and the next step", () => {
  it("GenerationErrorCard: LLM_PRIVACY verbatim, with Retry and Write it myself", () => {
    const gen = failed("LLM_PRIVACY", PRIVACY);
    const out = html(
      <GenerationErrorCard title="Couldn't write the thread" message={gen.error ?? ""} code={gen.errorCode} onRetry={() => {}} onWriteMyself={() => {}} />
    );
    expect(out).toContain(PRIVACY.replace(/&/g, "&amp;"));
    expect(out).toContain("Retry");
    expect(out).toContain("Write it myself");
    expect(out).toContain("then press Retry");
    expect(out).not.toContain("Try again");
    expect(out).toContain('role="alert"');
  });

  it.each([
    ["LLM_AUTH", "The AI provider rejected the API key. Check LLM_API_KEY on this deployment."],
    ["LLM_CREDITS", "The AI provider says the account is out of credits."],
    ["LLM_NOT_CONFIGURED", "The AI model is not set up on this deployment (LLM_API_KEY or LLM_MODEL is missing)."],
    ["LLM_RATE_LIMIT", "The AI model is rate-limited right now. Wait a minute and try again."],
    ["LLM_ERROR", "The AI model returned an error: provider said overloaded."],
  ])("ThreadsColumn with %s shows the message in full", (code, message) => {
    const out = html(
      <ThreadsColumn
        readiness={missing}
        gen={failed(code, message)}
        placeholders={["Hook"]}
        emptyCopy="x"
      />
    );
    expect(out).toContain(message);
    expect(out).toContain("Couldn&#x27;t write the thread");
    expect(out).toContain("Write it myself");
  });

  it("the Instagram panels show it too", () => {
    const out = html(
      <IgPanel
        kind="reel"
        readiness={missing}
        mediaState="none"
        asset={undefined}
        media={media}
        onAttach={() => {}}
        gen={failed("LLM_CREDITS", "The AI provider says the account is out of credits.")}
      />
    );
    expect(out).toContain("The AI provider says the account is out of credits.");
    expect(out).toContain("Retry");
  });

  it("a long message is not clipped by the markup", () => {
    const long = `The AI model returned an error: ${"provider detail ".repeat(30).trim()}`;
    const out = html(
      <GenerationErrorCard title="t" message={long} code="LLM_ERROR" onRetry={() => {}} onWriteMyself={() => {}} />
    );
    expect(out).toContain(long);
  });

  it("Write it myself offers to save the text as a real draft, and another try with the model", () => {
    const out = html(<ManualDraft label="Threads post" limit={500} autoFocus={false} onSave={async () => {}} onRetry={() => {}} />);
    expect(out).toContain("Not saved yet. Press Save draft");
    expect(out).toContain("Save draft");
    expect(out).toContain("queue it like any other draft");
    expect(out).toContain("Try drafting again");
    expect(out).toContain("studio-textarea studio-manual-field");
  });

  it("without a save handler it still says plainly that the text is only on the page", () => {
    const out = html(<ManualDraft label="Threads post" autoFocus={false} />);
    expect(out).toContain("only on this page and is not saved");
    expect(out).not.toContain("Save draft");
  });
});

describe("Research failures", () => {
  it("shows the message whole and the next step, as an alert", () => {
    const f = researchFailure(new ConvexError(`VALIDATION:LLM_PRIVACY: ${PRIVACY}`), "brief");
    const out = html(<ResearchStatus failure={f} />);
    expect(out).toContain('role="alert"');
    expect(out).toContain(PRIVACY.replace(/&/g, "&amp;"));
    expect(out).toContain("press Write brief again");
    expect(out).toContain("Write it myself");
  });

  it("shows progress while a call runs, and nothing when idle", () => {
    expect(html(<ResearchStatus busyText="Writing the brief…" />)).toContain("Writing the brief…");
    expect(html(<ResearchStatus />)).not.toContain("alert");
  });

  it("Suggest angles failures name the retry button", () => {
    const f = researchFailure(new ConvexError("VALIDATION:LLM_RATE_LIMIT: The AI model is rate-limited right now."), "angles");
    const out = html(<ResearchStatus failure={f} />);
    expect(out).toContain("The AI model is rate-limited right now.");
    expect(out).toContain("press Suggest angles again");
  });
});

describe("story frame picker", () => {
  const topic = { _id: "t1", title: "My topic", status: "drafting" } as never;
  const frames = [
    { key: "confession", name: "Confession", beats: [{ label: "Admit", hint: "" }, { label: "Cost", hint: "" }, { label: "Fix", hint: "" }, { label: "Invite", hint: "" }] },
    { key: "receipt", name: "The receipt", beats: [{ label: "Claim", hint: "" }, { label: "Proof", hint: "" }] },
  ] as never;

  function column(over: Record<string, unknown> = {}) {
    return html(
      <TopicColumn
        topic={topic}
        sources={[]}
        pillarName={undefined}
        frames={frames}
        frameValue="confession"
        defaultFrameKey="confession"
        onFrame={() => {}}
        beatLabels={["Admit", "Cost", "Fix", "Invite"]}
        voice="Dry founder."
        busy={false}
        {...over}
      />
    );
  }

  it("explains what a story frame is, in one plain sentence beside the picker", () => {
    const out = column();
    expect(out).toContain("A story frame is the shape of the post, for example Confession: admit it, what it cost, the fix, the invite. Pick one, or leave the default.");
    expect(out).toContain("Story frame (optional)");
  });

  it("preselects the default and lists each frame with its beats", () => {
    const out = column();
    expect(out).toMatch(/<option value="confession" selected="">Confession: Admit, Cost, Fix, Invite \(default\)<\/option>/);
    expect(out).toContain("The receipt: Claim, Proof");
  });
});
