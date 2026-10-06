/**
 * Stand-in for a section whose controls are built in a later step. It says
 * so plainly rather than showing controls that do nothing.
 */
export default function PlannedSection({ label }: { label: string }) {
  return (
    <section className="sq-card" aria-label={label}>
      <span className="sq-tag">Coming next</span>
      <p className="sq-muted st-none">
        {label} is not editable here yet. Nothing in it is changing your posts
        in the meantime.
      </p>
    </section>
  );
}
