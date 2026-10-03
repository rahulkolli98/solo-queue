"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "@/components/ui/icons";

/**
 * A modal panel: a right-hand drawer on desktop, a bottom sheet on phones
 * (shell/components CSS switches at 768px). Built on the native <dialog> so
 * focus is trapped, Esc closes and the page behind is inert. Clicking the
 * scrim closes it too.
 */
export default function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  width = "side",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** "side" is the 470px slot drawer; "edit" is the wider 520px edit panel. */
  width?: "side" | "edit";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`sq-drawer sq-drawer-${width}`}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => {
        // A click on the dialog element itself (not its content) is the scrim.
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="sq-drawer-body">
          <span className="sq-drawer-handle" aria-hidden="true" />
          <div className="sq-drawer-head">
            <div className="sq-drawer-titles">
              {eyebrow && <span className="t-eyebrow">{eyebrow}</span>}
              <h2 className="t-title">{title}</h2>
            </div>
            <button type="button" className="sq-icon-btn" aria-label="Close" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
          <div className="sq-drawer-content">{children}</div>
          {footer && <div className="sq-drawer-footer">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
