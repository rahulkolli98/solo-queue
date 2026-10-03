import type { ReactNode } from "react";
import ActionButton, { limitActions, type Action } from "@/components/ui/ActionButton";
import { AlertIcon, CalendarIcon, ClockIcon } from "@/components/ui/icons";

/** coral = something failed, yellow = something is about to, blue = a gap in coverage. */
export type BannerTone = "coral" | "yellow" | "blue";

const DEFAULT_ICON: Record<BannerTone, () => React.JSX.Element> = {
  coral: AlertIcon,
  yellow: ClockIcon,
  blue: CalendarIcon,
};

export interface BannerProps {
  tone: BannerTone;
  /** Bold lead sentence, in the diagnostic voice ("Instagram post failed · Sat 26 Sep, 12:00."). */
  title: string;
  /** The reason or the next step, shown after the title. */
  detail?: ReactNode;
  /** At most two are rendered. */
  actions?: Action[];
  icon?: ReactNode;
}

/**
 * Alert strip for the Today board and the Queue (design.md: banner).
 * Failures announce themselves (role="alert"); the other tones are polite.
 */
export default function Banner({ tone, title, detail, actions, icon }: BannerProps) {
  const Icon = DEFAULT_ICON[tone];
  const shown = limitActions(actions);
  return (
    <div
      className={`sq-banner-tone sq-banner-${tone}`}
      role={tone === "coral" ? "alert" : "status"}
    >
      {icon ?? <Icon />}
      <div className="sq-banner-body">
        <b>{title}</b>
        {detail && <small>{detail}</small>}
      </div>
      {shown.length > 0 && (
        <div className="sq-banner-actions">
          {shown.map((action) => (
            <ActionButton key={action.label} action={action} />
          ))}
        </div>
      )}
    </div>
  );
}
