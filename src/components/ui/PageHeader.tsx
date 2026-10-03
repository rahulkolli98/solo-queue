import type { ReactNode } from "react";

/**
 * The editorial header every screen opens with (design.md § Layout): an
 * eyebrow line, an optional grotesk kicker, one big statement with a single
 * rust word (wrap it in <em>), and on the right a short explainer and the
 * screen's actions.
 */
export default function PageHeader({
  eyebrow,
  kicker,
  headline,
  aside,
  actions,
}: {
  eyebrow?: ReactNode;
  kicker?: ReactNode;
  /** Put the one rust word in <em>…</em>. */
  headline: ReactNode;
  /** A sentence or two of explainer. */
  aside?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="sq-pageheader">
      <div className="sq-pageheader-main">
        {eyebrow && <span className="t-eyebrow sq-pageheader-eyebrow">{eyebrow}</span>}
        {kicker && <span className="t-kicker">{kicker}</span>}
        <h1 className="sq-headline">{headline}</h1>
      </div>
      {(aside || actions) && (
        <div className="sq-pageheader-side">
          {aside && <p className="sq-sub">{aside}</p>}
          {actions && <div className="sq-row">{actions}</div>}
        </div>
      )}
    </header>
  );
}
