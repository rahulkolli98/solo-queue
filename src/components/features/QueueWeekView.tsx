"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../../convex/_generated/api";
import { forwardCoverage, startOfDay } from "../../lib/slots";
import SlotCard, { type WeekSlot } from "./SlotCard";

function dayLabel(ts: number, todayStart: number): string {
  const d = new Date(ts);
  const dayStart = startOfDay(ts).getTime();
  const diff = Math.round((dayStart - todayStart) / 86400000);
  const name =
    diff === 0
      ? "Today"
      : diff === 1
        ? "Tomorrow"
        : d.toLocaleDateString("en-GB", { weekday: "long" });
  const date = d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${name} · ${date}`.toUpperCase();
}

function Lane({ title, slots, todayStart }: { title: string; slots: WeekSlot[]; todayStart: number }) {
  const coverage = forwardCoverage(slots);
  const byDay = useMemo(() => {
    const map = new Map<number, WeekSlot[]>();
    for (const s of slots) {
      const key = startOfDay(s.scheduledAt).getTime();
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [slots]);

  return (
    <section className="sq-card" aria-label={`${title} lane`}>
      <div className="sq-card-h">
        <h2 className="sq-card-title">{title}</h2>
        <span className="sq-tag" style={{ marginLeft: "auto" }}>
          COVERED {coverage} / 7 DAYS
        </span>
      </div>
      {slots.length === 0 && (
        <p className="sq-muted" style={{ margin: 0 }}>
          Nothing scheduled this week. Queue from Studio and it lands here.
        </p>
      )}
      {byDay.map(([day, daySlots]) => (
        <div key={day} style={{ marginTop: daySlots === byDay[0][1] ? 0 : 12 }}>
          <span className="t-meta" style={{ color: "var(--color-muted-on-surface)" }}>
            {dayLabel(day, todayStart)}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            {daySlots.map((s) => (
              <SlotCard key={s._id} slot={s} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export default function QueueWeekView() {
  const from = useMemo(() => startOfDay(Date.now()).getTime(), []);
  const slots = useQuery(api.slots.week, { from });

  if (slots === undefined) return <p className="sq-muted">Loading week…</p>;

  const threads = slots.filter((s) => s.platform === "threads");
  const instagram = slots.filter((s) => s.platform === "instagram");
  // The thinner queue governs the week.
  const overall = Math.min(forwardCoverage(threads), forwardCoverage(instagram));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <section className="sq-card" aria-label="Coverage">
        <div className="sq-card-h">
          <h2 className="sq-card-title">Coverage</h2>
          <span className="sq-tag" style={{ marginLeft: "auto" }}>
            {overall} / 7 DAYS
          </span>
        </div>
        <p className="sq-muted" style={{ margin: 0 }}>
          Consecutive days from today with a post on both platforms. The
          thinner queue governs — top up whichever lane runs out first.
        </p>
      </section>
      <Lane title="Threads" slots={threads} todayStart={from} />
      <Lane title="Instagram" slots={instagram} todayStart={from} />
    </div>
  );
}
