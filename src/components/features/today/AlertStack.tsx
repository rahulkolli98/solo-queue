"use client";

import { useConvex, useMutation } from "convex/react";
import { useRef } from "react";
import Banner from "@/components/ui/Banner";
import { useToast } from "@/components/ui/Toast";
import { errorText } from "@/lib/errors";
import { PLATFORM_NAME } from "@/lib/queueBoard";
import type { TodaySummary } from "@/lib/today";
import { api } from "../../../../convex/_generated/api";

/**
 * Today's alerts, worst first: a failed post (coral), an expiring or failed
 * token (yellow), a thin queue (blue). Each carries the board's actions; the
 * coverage nudge can be dismissed for the week.
 */
export default function AlertStack({ alerts }: { alerts: TodaySummary["alerts"] }) {
  const convex = useConvex();
  const updateSettings = useMutation(api.settings.update);
  const { toast } = useToast();
  const working = useRef(false);

  async function dismiss(key: string) {
    if (working.current) return;
    working.current = true;
    try {
      const current = await convex.query(api.settings.get, {});
      if (!current.dismissedNudges.includes(key)) {
        await updateSettings({ patch: { dismissedNudges: [...current.dismissedNudges, key] } });
      }
      toast({ title: "Dismissed for this week", detail: "It comes back next week if the queue is still thin." });
    } catch (e) {
      toast({ title: "Could not dismiss", detail: errorText(e, "Try again."), tone: "bad" });
    } finally {
      working.current = false;
    }
  }

  if (alerts.length === 0) return null;
  return (
    <div className="sq-t-alerts">
      {alerts.map((alert) => {
        if (alert.kind === "failed") {
          return (
            <Banner
              key={alert.id}
              tone="coral"
              title={alert.title}
              detail={alert.detail}
              actions={[
                { label: "Replace media", href: "/library/media" },
                {
                  label: "Reschedule",
                  href: alert.slotId ? `/queue?slot=${alert.slotId}` : "/queue",
                  variant: "primary",
                },
              ]}
            />
          );
        }
        if (alert.kind === "expiring") {
          return (
            <Banner
              key={alert.id}
              tone="yellow"
              title={alert.title}
              detail={alert.detail}
              actions={[{ label: `Reconnect ${PLATFORM_NAME[alert.platform]}`, href: "/settings", variant: "primary" }]}
            />
          );
        }
        return (
          <Banner
            key={alert.id}
            tone="blue"
            title={alert.title}
            detail={alert.detail}
            actions={[
              { label: "Fill from research", href: "/research", variant: "primary" },
              ...(alert.dismissKey
                ? [{ label: "Dismiss this week", onClick: () => void dismiss(alert.dismissKey!) }]
                : []),
            ]}
          />
        );
      })}
    </div>
  );
}
