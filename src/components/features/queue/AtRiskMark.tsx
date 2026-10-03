/**
 * Words, not colour alone: a scheduled post whose platform connection is
 * missing, failed or about to expire. The reason is the tooltip and the
 * drawer note.
 */
export default function AtRiskMark({ reason }: { reason: string | null | undefined }) {
  if (!reason) return null;
  return (
    <span className="sq-q-risk" title={reason}>
      AT RISK
    </span>
  );
}

/** The same reason in full, for the slot drawer. */
export function AtRiskNote({ reason }: { reason: string | null | undefined }) {
  if (!reason) return null;
  return (
    <div className="sq-q-risk-note" role="status">
      <span className="sq-q-risk">AT RISK</span>
      <span>{reason}</span>
    </div>
  );
}
