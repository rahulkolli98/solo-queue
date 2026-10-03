import { CheckIcon } from "@/components/ui/icons";
import type { GuideStep } from "@/lib/studioModel";

/**
 * The always-visible 4-step strip: 1 Topic, 2 Drafts, 3 Media for Instagram,
 * 4 Queue. Done steps carry a tick, the current one is filled, the rest are
 * outlines; state is also in words for screen readers, never colour alone.
 */
export default function StudioGuideStrip({ steps }: { steps: GuideStep[] }) {
  return (
    <ol className="studio-guide" aria-label="Steps">
      {steps.map((step) => (
        <li
          key={step.key}
          className="studio-guide-step"
          data-state={step.state}
          aria-current={step.state === "current" ? "step" : undefined}
        >
          <span className="studio-guide-num" aria-hidden="true">
            {step.state === "done" ? <CheckIcon /> : step.number}
          </span>
          <span className="studio-guide-label">{step.label}</span>
          <span className="sq-sr">{step.state === "done" ? " (done)" : step.state === "current" ? " (you are here)" : ""}</span>
        </li>
      ))}
    </ol>
  );
}
