import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";

/** Board 07m: an unknown address is an empty slot. */
export default function NotFound() {
  return (
    <div className="sq-404">
      <h1 className="sq-404-num" aria-label="404">
        4<span className="sq-404-dot" aria-hidden="true" />4
      </h1>
      <div className="sq-404-copy">
        <div className="sq-paper sq-404-label">
          <span className="sq-tape" aria-hidden="true" />
          <span className="t-mono">PAGE NOT FOUND</span>
        </div>
        <h2 className="sq-404-title">
          This slot is <em>empty.</em>
        </h2>
        <p className="sq-404-text">
          The page you asked for isn&rsquo;t in the queue. It may have moved,
          or the link was mistyped.
        </p>
        <div className="sq-row">
          <Link href="/" className="sq-btn sq-btn-primary">
            Back to Today
            <ArrowRightIcon />
          </Link>
          <Link href="/queue" className="sq-btn">
            Open the queue
          </Link>
        </div>
      </div>
    </div>
  );
}
