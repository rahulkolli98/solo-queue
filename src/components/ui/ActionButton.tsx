import Link from "next/link";

export interface Action {
  label: string;
  /** Internal route. Renders a link; use `onClick` for in-page actions. */
  href?: string;
  onClick?: () => void;
  /** "primary" is the single recommended action; default is the outline style. */
  variant?: "primary" | "secondary";
}

/** Banners and toasts carry at most two actions (design.md). */
export const MAX_ACTIONS = 2;

export function limitActions(actions: Action[] | undefined): Action[] {
  return (actions ?? []).slice(0, MAX_ACTIONS);
}

/** Small action used inside banners and toasts; a link when `href` is set, else a button. */
export default function ActionButton({ action }: { action: Action }) {
  const className = `sq-btn sq-btn-sm${action.variant === "primary" ? " sq-btn-primary" : ""}`;
  if (action.href) {
    return (
      <Link href={action.href} className={className} onClick={action.onClick}>
        {action.label}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={action.onClick}>
      {action.label}
    </button>
  );
}
