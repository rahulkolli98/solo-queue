import SlotRulesForm from "@/components/features/SlotRulesForm";

/** Board 06a: default posting times (the rest of the board arrives with TASK-079). */
export default function SlotsSection() {
  return (
    <section className="sq-card" aria-label="Posting slots">
      <p className="sq-muted" style={{ margin: 0 }}>
        Default post times per platform. The composer pre-fills new slots with
        these; any slot can still be moved.
      </p>
      <SlotRulesForm />
    </section>
  );
}
