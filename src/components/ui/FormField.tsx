import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

/**
 * A labelled control with an optional hint and an inline error (design.md:
 * field, field-label, field-error). Pass one input/textarea/select as the
 * child; this wires id, aria-describedby and aria-invalid.
 */
export default function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean; className?: string }>;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        className: `${children.props.className ?? ""} sq-input${error ? " sq-input-error" : ""}`.trim(),
      })
    : children;
  return (
    <div className="sq-formfield">
      <label htmlFor={id} className="sq-formfield-label">
        {label}
      </label>
      {control}
      {hint && !error && (
        <span id={`${id}-hint`} className="sq-formfield-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-error`} className="sq-formfield-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
