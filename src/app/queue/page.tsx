import QueueWeekView from "@/components/features/QueueWeekView";

export default function QueuePage() {
  return (
    <>
      <span className="sq-tag">Week view</span>
      <h1 className="sq-headline">
        The week, <em>at a glance.</em>
      </h1>
      <p className="sq-sub">
        Every scheduled slot per platform with live coverage. Reschedule or
        cancel a card — the draft stays safe in Studio either way.
      </p>
      <QueueWeekView />
    </>
  );
}
