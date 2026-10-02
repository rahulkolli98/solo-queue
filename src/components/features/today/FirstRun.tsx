"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CheckIcon } from "@/components/ui/icons";
import type { TodaySummary } from "@/lib/today";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import PlatformGlyph from "../queue/PlatformGlyph";
import FirstTopicForm from "./FirstTopicForm";
import RunwayCard from "./RunwayCard";

type StepState = "now" | "done" | "locked";

function StepCard({
  n,
  state,
  word,
  title,
  children,
  footer,
}: {
  n: number;
  state: StepState;
  /** The state word in the eyebrow: now, done, next or locked. */
  word: string;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className={`sq-t-card sq-t-step-${state}`} aria-label={`Step ${n}, ${word}`}>
      <div className="sq-t-card-head">
        <h2 className="t-eyebrow">
          Step {n} · {word}
        </h2>
        <span className="sq-t-step" aria-hidden="true">
          {state === "done" ? <CheckIcon /> : n}
        </span>
      </div>
      {title && <b className="t-title-lg sq-t-step-title">{title}</b>}
      {children}
      {footer && <div className="sq-t-actions">{footer}</div>}
    </section>
  );
}

/**
 * First run (board 07a): the card grid becomes a three-step checklist. The
 * step in play is coral with a ring and sits where Up next normally does;
 * finished steps go yellow, a locked step is dashed, Instagram is optional.
 */
export default function FirstRun({ summary }: { summary: TodaySummary }) {
  const { steps, inbox, meta } = summary;
  const topic = inbox.top[0];
  const drafts = useQuery(api.drafts.listByTopic, topic ? { topicId: topic.id as Id<"topics"> } : "skip");
  const hasDrafts = (drafts?.length ?? 0) > 0;
  const threads = meta.connections.find((c) => c.platform === "threads");
  const instagram = meta.connections.find((c) => c.platform === "instagram");
  const current = !steps.threadsConnected ? 1 : !steps.hasTopic ? 2 : hasDrafts ? 3 : 2;
  const topicSaved = steps.hasTopic;

  const step1 =
    current === 1 ? (
      <StepCard
        key="s1"
        n={1}
        state="now"
        word="now"
        title="Connect Threads"
        footer={
          <Link href="/settings" className="sq-btn sq-btn-dark">
            Connect Threads
          </Link>
        }
      >
        <span className="sq-t-step-text">One connection and the queue can post for you. Threads comes first.</span>
      </StepCard>
    ) : (
      <StepCard
        key="s1"
        n={1}
        state="done"
        word="done"
        title="Threads connected"
        footer={
          threads?.connected ? (
            <span className="sq-t-tag sq-t-tag-ink-yellow">● Token valid · {threads.tokenDaysLeft} d</span>
          ) : null
        }
      >
        <span className="sq-t-step-text">
          Posting as <b>{threads?.connected ? threads.handle : "your Threads account"}</b>. One post proves the whole loop.
        </span>
      </StepCard>
    );

  const step2 =
    current === 2 && !topicSaved ? (
      <StepCard key="s2" n={2} state="now" word="now">
        <FirstTopicForm />
      </StepCard>
    ) : current === 2 ? (
      <StepCard
        key="s2"
        n={2}
        state="now"
        word="now"
        title="Draft your first topic"
        footer={
          <Link href={topic ? `/studio/${topic.id}` : "/studio"} className="sq-btn sq-btn-dark">
            Open Studio
          </Link>
        }
      >
        <span className="sq-t-step-text">{topic ? `“${topic.title}” is saved.` : "A topic is saved."} Generate both platforms in Studio.</span>
      </StepCard>
    ) : topicSaved ? (
      <StepCard key="s2" n={2} state="done" word="done" title="Topic saved">
        <span className="sq-t-step-text">{topic ? `“${topic.title}” is in the inbox.` : "Your first topic is in the inbox."}</span>
      </StepCard>
    ) : (
      <StepCard key="s2" n={2} state="locked" word="next" title="Add your first topic">
        <span className="sq-t-step-text">Paste a link or a half-thought once Threads is connected.</span>
      </StepCard>
    );

  const step3 =
    current === 3 ? (
      <StepCard
        key="s3"
        n={3}
        state="now"
        word="now"
        title="Queue this week"
        footer={
          <Link href={topic ? `/studio/${topic.id}` : "/studio"} className="sq-btn sq-btn-dark">
            Queue the week
          </Link>
        }
      >
        <span className="sq-t-step-text">Your drafts are ready. One tap fills seven days of slots.</span>
      </StepCard>
    ) : (
      <StepCard key="s3" n={3} state="locked" word="locked" title="Queue this week">
        <span className="sq-t-step-text">Unlocks once your first drafts are ready. One tap fills seven days of slots.</span>
      </StepCard>
    );

  const ordered = [step1, step2, step3];
  const now = ordered[current - 1];
  const rest = ordered.filter((_, i) => i !== current - 1);

  return (
    <div className="sq-t-grid sq-t-firstrun">
      {now}
      <RunwayCard summary={summary} firstRun />
      {rest}
      <section className="sq-t-card sq-t-card-blue" aria-label="Optional: Instagram">
        <div className="sq-t-card-head">
          <h2 className="t-eyebrow">Optional</h2>
          <PlatformGlyph platform="instagram" />
        </div>
        <b className="t-title-lg sq-t-step-title">{instagram?.connected ? "Instagram connected" : "Instagram can wait"}</b>
        <span className="sq-t-step-text">
          {instagram?.connected
            ? `Posting as ${instagram.handle}.`
            : "Connect it whenever you are ready. It needs a Creator or Business account."}
        </span>
        {!instagram?.connected && (
          <div className="sq-t-actions">
            <Link href="/settings" className="sq-btn">
              Connect Instagram
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
