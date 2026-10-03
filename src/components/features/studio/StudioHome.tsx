"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { InstagramAvatar, ThreadsAvatar } from "@/components/features/studio/glyphs";
import NewTopicColumn from "@/components/features/studio/NewTopicColumn";
import StudioBottomBar from "@/components/features/studio/StudioBottomBar";
import StudioGuideStrip from "@/components/features/studio/StudioGuideStrip";
import { useOpenSlots } from "@/components/features/studio/useOpenSlots";
import Banner from "@/components/ui/Banner";
import PageHeader from "@/components/ui/PageHeader";
import { fillBanner, type FillSlot } from "@/lib/studioHandoff";
import { barSummary, studioHomeGuide } from "@/lib/studioModel";

const FALLBACK_BEATS = ["Hook", "Tension", "Turn", "Payoff"];
const REEL_GHOSTS = ["0:00 · On screen", "0:02 · Voice-over", "0:08 · B-roll", "0:25 · Call to action"];

/** Board 07c: /studio with no topic: capture form, inbox picker, empty columns, disabled bar. */
export default function StudioHome({ slot = null }: { slot?: FillSlot | null }) {
  const settings = useQuery(api.settings.get);
  const frame = useQuery(api.frames.getByKey, settings ? { key: settings.voice.defaultFrameKey } : "skip");
  const beats = frame?.beats.map((b) => b.label) ?? FALLBACK_BEATS;
  const { board, chips } = useOpenSlots();
  const summary = barSummary({ states: {}, generating: false, emptySub: "PICK A TOPIC TO START" });
  const inbox = useQuery(api.topics.board);
  const guide = studioHomeGuide((inbox ?? []).some((t) => t.status === "drafting" || t.status === "ready"));
  const [dismissed, setDismissed] = useState(false);
  const fill = slot && !dismissed ? fillBanner(slot) : null;

  return (
    <>
      <PageHeader
        eyebrow="Studio / new batch"
        kicker="One topic in —"
        headline={
          <>
            pick a topic to <em>start.</em>
          </>
        }
      />
      <StudioGuideStrip steps={guide.steps} />
      {fill && (
        <Banner
          tone="blue"
          title={fill.title}
          detail={fill.detail}
          actions={[{ label: "Got it", onClick: () => setDismissed(true) }]}
        />
      )}
      <div className="studio-grid" data-pane="threads">
        <NewTopicColumn emphasiseInbox={Boolean(fill)} />
        <section className="studio-col studio-col-threads" aria-label="Threads thread">
          <div className="studio-colhead">
            <div className="studio-colhead-title">
              <ThreadsAvatar />
              <h2 className="t-title">Threads</h2>
            </div>
          </div>
          {beats.map((label, i) => (
            <div className="studio-ghost" key={label}>
              <span className="t-meta">
                {i + 1} · {label.toUpperCase()}
              </span>
            </div>
          ))}
          <p className="studio-empty-copy">Pick a topic and the thread lands here.</p>
        </section>
        <section className="studio-col studio-col-ig" aria-label="Instagram drafts">
          <div className="studio-colhead">
            <div className="studio-colhead-title">
              <InstagramAvatar />
              <h2 className="t-title">Instagram</h2>
            </div>
            <span className="t-mono studio-count">0 / 2 DRAFTS</span>
          </div>
          {REEL_GHOSTS.map((label) => (
            <div className="studio-ghost studio-ghost-light" key={label}>
              <span className="t-meta">{label.toUpperCase()}</span>
            </div>
          ))}
          <p className="studio-empty-copy">Pick a topic and the reel script lands here.</p>
        </section>
      </div>
      <StudioBottomBar
        summary={summary}
        slots={chips}
        slotsLoading={board === undefined}
        blogChecked={false}
        blogLocked={false}
        onBlog={() => undefined}
        onQueue={() => undefined}
        queuing={false}
        nextStep={guide.text}
        nextTone={guide.tone}
      />
    </>
  );
}
