"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { angleLabel } from "@/lib/researchBoard";
import { researchFailure, type ResearchFailure } from "@/lib/researchErrors";
import ResearchStatus from "./ResearchStatus";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { Frame } from "./types";

type Angle = { platform: string; format: string; frameKey: string; title: string };

/** "Angles to try": three post ideas (platform, format, story frame) from research.angles. */
export default function AnglesRow({
  topicId,
  angles,
  frames,
}: {
  topicId: Id<"topics">;
  angles: Angle[] | undefined;
  frames: Frame[];
}) {
  const suggest = useAction(api.research.angles);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ResearchFailure | null>(null);

  async function run() {
    setBusy(true);
    setFailure(null);
    try {
      await suggest({ topicId });
    } catch (err) {
      setFailure(researchFailure(err, "angles"));
    } finally {
      setBusy(false);
    }
  }

  const has = Boolean(angles && angles.length > 0);
  return (
    <div className="rs-angles-wrap">
      <div className="rs-angles-head">
        <span className="t-eyebrow">Angles to try</span>
        {has && (
          <button type="button" className="sq-btn" disabled={busy} onClick={() => void run()}>
            {busy ? "Writing…" : "More angles"}
          </button>
        )}
      </div>
      {has ? (
        <div className="rs-angles">
          {(angles ?? []).slice(0, 3).map((a, i) => (
            <div key={`${a.frameKey}-${i}`} className={`rs-angle rs-angle-${i}`}>
              <span className="t-meta rs-angle-kind">{angleLabel(a, frames)}</span>
              <span className="rs-angle-title">{a.title}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rs-angles-empty">
          <span>Three angles for this topic, each with a platform, a format and a story frame.</span>
          <button type="button" className="sq-btn sq-btn-sm sq-btn-dark" disabled={busy} onClick={() => void run()}>
            {busy ? "Writing…" : "Suggest angles"}
          </button>
        </div>
      )}
      <ResearchStatus busyText={busy ? "Writing three angles…" : undefined} failure={failure} />
    </div>
  );
}
