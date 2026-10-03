"use client";

import { useState } from "react";
import AutoTextarea from "@/components/features/studio/AutoTextarea";
import GenerationErrorCard from "@/components/features/studio/GenerationErrorCard";
import ManualDraft from "@/components/features/studio/ManualDraft";
import MediaPanel from "@/components/features/studio/MediaPanel";
import type { DraftView, GenState } from "@/components/features/studio/types";
import type { MediaActions } from "@/components/features/studio/useMediaActions";
import { CAPTION_LIMIT, charLen, parseReelScript, trimToFit, wordCount } from "@/lib/draftText";
import type { Asset, DraftKind, MediaState, Readiness } from "@/lib/studioModel";

const REEL_GHOSTS = ["0:00 · On screen", "0:02 · Voice-over", "0:08 · B-roll", "0:25 · Call to action"];
const CAPTION_GHOSTS = ["Hook line", "Beats", "Call to action"];

export interface IgPanelProps {
  kind: Extract<DraftKind, "caption" | "reel">;
  view?: DraftView;
  readiness: Readiness;
  mediaState: MediaState;
  asset: Asset | undefined;
  media: MediaActions;
  onAttach: () => void;
  gen: GenState;
  /** "SAT 10 OCT · 18:30" and whether it fills a gap. */
  target?: { when: string; gap: boolean };
  queuedWhen?: string | null;
  /** The "Write it myself" box has (true) or lost (false) text that is not saved to the topic. */
  onManualText?: (hasText: boolean) => void;
  /** Store the "Write it myself" text as this kind's draft. */
  onSaveManual?: (text: string) => Promise<void>;
}

function SceneSkeleton() {
  return (
    <div aria-busy="true" className="studio-scenes">
      {[0, 1, 2, 3, 4].map((i) => (
        <div className="studio-scene" key={i}>
          <span className="sq-sk studio-sk-time" />
          <div className="studio-skel">
            <span className="sq-sk studio-sk-line" data-w="94" />
            <span className="sq-sk studio-sk-line" data-w="66" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Ghosts({ labels, copy }: { labels: string[]; copy: string }) {
  return (
    <>
      {labels.map((label) => (
        <div className="studio-ghost studio-ghost-light" key={label}>
          <span className="t-meta">{label.toUpperCase()}</span>
        </div>
      ))}
      <p className="studio-empty-copy">{copy}</p>
    </>
  );
}

function ReelBody({ view }: { view: DraftView }) {
  const script = parseReelScript(view.body);
  const [editing, setEditing] = useState(false);
  const showText = editing || !script;
  return (
    <div className="studio-reel">
      {showText ? (
        <AutoTextarea
          className="studio-textarea studio-textarea-block"
          aria-label="Reel script"
          value={view.body}
          onChange={(e) => view.onChange(e.target.value)}
          onBlur={view.onBlur}
        />
      ) : (
        <div className="studio-scenes">
          {script.scenes.map((scene) => (
            <div className="studio-scene" key={scene.time}>
              <span className="t-mono studio-scene-time">{scene.time}</span>
              <div>
                {scene.label && <b>{scene.label}: </b>}
                {scene.text}
              </div>
            </div>
          ))}
          {script.caption && (
            <div className="studio-scene studio-scene-caption">
              <span className="t-mono studio-scene-time">CAPTION</span>
              <div>{script.caption}</div>
            </div>
          )}
        </div>
      )}
      <div className="studio-reel-foot">
        <span className="t-meta">SCRIPT · {wordCount(view.body)} WORDS</span>
        {script && (
          <button type="button" className="sq-btn sq-btn-sm" onClick={() => setEditing((v) => !v)}>
            {editing ? "Done editing" : "Edit script"}
          </button>
        )}
      </div>
    </div>
  );
}

function CaptionBody({ view, readiness }: { view: DraftView; readiness: Readiness }) {
  const length = charLen(view.body.trim());
  const over = length - CAPTION_LIMIT;
  return (
    <div className="studio-caption">
      <div className="studio-caption-head">
        <span className="t-meta">
          CAPTION · {length.toLocaleString("en-GB")} / {CAPTION_LIMIT.toLocaleString("en-GB")}
        </span>
        {over > 0 && (
          <>
            <span className="sq-pill sq-pill-bad">OVER BY {over}</span>
            <button
              type="button"
              className="sq-btn sq-btn-sm"
              onClick={() => view.onChange(trimToFit(view.body, CAPTION_LIMIT))}
            >
              Trim to fit
            </button>
          </>
        )}
      </div>
      <AutoTextarea
        className="studio-textarea studio-textarea-block"
        aria-label="Instagram caption"
        aria-invalid={readiness.state === "over" || undefined}
        value={view.body}
        onChange={(e) => view.onChange(e.target.value)}
        onBlur={view.onBlur}
      />
    </div>
  );
}

/** One Instagram draft (reel script or caption) with its media and target slot. */
export default function IgPanel({
  kind,
  view,
  readiness,
  mediaState,
  asset,
  media,
  onAttach,
  gen,
  target,
  queuedWhen,
  onManualText,
  onSaveManual,
}: IgPanelProps) {
  const [manual, setManual] = useState(false);
  const label = kind === "reel" ? "reel script" : "caption";

  if (gen.writing) {
    return kind === "reel" ? (
      <>
        <SceneSkeleton />
        <p className="studio-empty-copy">The {label} starts once the thread is done.</p>
        <span className="t-mono studio-foot-hot">WRITING THE {label.toUpperCase()}… {gen.elapsed}</span>
      </>
    ) : (
      <div aria-busy="true" className="studio-skel studio-skel-block">
        <span className="sq-sk studio-sk-line" />
        <span className="sq-sk studio-sk-line" data-w="88" />
        <span className="sq-sk studio-sk-line" data-w="72" />
        <span className="sq-sk studio-sk-line" data-w="55" />
        <span className="t-mono studio-foot-hot">WRITING THE CAPTION… {gen.elapsed}</span>
      </div>
    );
  }
  if (!view) {
    if (gen.error || manual) {
      return manual ? (
        <ManualDraft
          label={kind === "reel" ? "Reel script" : "Caption"}
          limit={kind === "caption" ? CAPTION_LIMIT : undefined}
          onText={(t) => onManualText?.(t.trim().length > 0)}
          onSave={onSaveManual}
          onRetry={gen.onRetry}
          retrying={gen.retrying}
        />
      ) : (
        <GenerationErrorCard
          title={`Couldn't write the ${label}`}
          message={gen.error ?? ""}
          code={gen.errorCode}
          onRetry={gen.onRetry}
          busy={gen.retrying}
          onWriteMyself={() => setManual(true)}
        />
      );
    }
    return (
      <>
        <Ghosts
          labels={kind === "reel" ? REEL_GHOSTS : CAPTION_GHOSTS}
          copy={`Generate and the ${label} lands here.`}
        />
        <button type="button" className="sq-btn sq-btn-sm studio-write-myself" onClick={() => setManual(true)}>
          Write it myself
        </button>
      </>
    );
  }

  const queued = readiness.state === "queued";
  return (
    <>
      {kind === "reel" ? <ReelBody view={view} /> : <CaptionBody view={view} readiness={readiness} />}
      {!queued && (
        <MediaPanel
          kind={kind}
          draftId={view.draft._id}
          asset={asset}
          state={mediaState}
          media={media}
          onAttach={onAttach}
        />
      )}
      <div className="studio-ig-foot">
        {queued ? (
          <span className="t-mono studio-foot-ok">QUEUED{queuedWhen ? ` → ${queuedWhen}` : ""}</span>
        ) : target ? (
          <span className="t-mono studio-foot-rust">
            → {target.when}
            {target.gap ? " · FILLS GAP" : ""}
          </span>
        ) : (
          <span className="t-mono studio-foot-rust">NO OPEN SLOT IN THE NEXT 2 WEEKS</span>
        )}
        <span className="t-meta">V{view.draft.templateVersion}</span>
      </div>
    </>
  );
}
