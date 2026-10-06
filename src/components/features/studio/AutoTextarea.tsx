"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/**
 * A textarea that grows with its text, so a post reads like text and edits like a field.
 * It re-fits when its width changes (rotating a phone, a web font arriving), not only when
 * the text does, so the last line is never clipped.
 */
export default function AutoTextarea({
  value,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "rows"> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    let width = el.offsetWidth;
    const watch = new ResizeObserver(() => {
      if (el.offsetWidth === width) return;
      width = el.offsetWidth;
      fit();
    });
    watch.observe(el);
    // The web font can arrive after the first fit and wrap the text differently.
    void document.fonts?.ready.then(fit);
    return () => watch.disconnect();
  }, [value]);
  return <textarea ref={ref} value={value} rows={1} {...rest} />;
}
