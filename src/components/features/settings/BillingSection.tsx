/** Board 06g: no payments in v1, so this is a static card. */
export default function BillingSection() {
  return (
    <section className="sq-card" aria-label="Plan and billing">
      <span className="sq-tag">Plan</span>
      <h3 className="sq-card-title">Solo · personal</h3>
      <p className="sq-muted" style={{ margin: 0 }}>
        Solo Queue is yours alone, so there is nothing to pay for here. Posting
        goes through Meta&apos;s official APIs, which charge $0 per post.
      </p>
    </section>
  );
}
