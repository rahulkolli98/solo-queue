import Skeleton from "@/components/ui/Skeleton";

/**
 * The editorial header of a screen as blank shapes: a big statement on the
 * left (stacked lines) and a short explainer on the right.
 */
export default function SkeletonHeader({
  statementWidth,
  statementLines = [100, 70],
  lineHeight = 62,
  explainerWidth = 340,
  explainerLines = [100, 80],
}: {
  /** px width of the statement column (default: 62% of the row). */
  statementWidth?: number;
  /** Width (%) of each statement line. */
  statementLines?: number[];
  lineHeight?: number;
  explainerWidth?: number;
  /** Width (%) of each explainer line. */
  explainerLines?: number[];
}) {
  return (
    <div className="sq-skel-header">
      <div
        className="sq-skel-col"
        style={{ width: statementWidth ?? "62%", gap: 12 }}
      >
        {statementLines.map((w, i) => (
          <Skeleton key={i} w={`${w}%`} h={lineHeight} />
        ))}
      </div>
      <div className="sq-skel-col" style={{ width: explainerWidth, gap: 8 }}>
        {explainerLines.map((w, i) => (
          <Skeleton key={i} w={`${w}%`} h={14} />
        ))}
      </div>
    </div>
  );
}
