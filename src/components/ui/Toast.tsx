"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ActionButton from "@/components/ui/ActionButton";
import { AlertIcon, CheckIcon, CloseIcon } from "@/components/ui/icons";
import {
  TOAST_MS,
  toastReducer,
  type ToastInput,
  type ToastItem,
} from "@/lib/toast";

interface ToastApi {
  /** Show a toast; returns its id. */
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>.");
  return api;
}

/** A failure interrupts the reader ("alert"); a confirmation waits its turn ("status"). */
export function toastRole(tone: ToastItem["tone"]): "alert" | "status" {
  return tone === "bad" ? "alert" : "status";
}

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  // Paused while the pointer or keyboard focus is on the toast, so its
  // actions can be reached before it disappears.
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(item.id), TOAST_MS);
    return () => clearTimeout(timer);
  }, [paused, item.id, onDismiss]);

  const bad = item.tone === "bad";
  return (
    <div
      role={toastRole(item.tone)}
      className={`sq-toast${bad ? " sq-toast-bad" : ""}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="sq-toast-head">
        <span className="sq-toast-mark" aria-hidden="true">
          {bad ? <AlertIcon /> : <CheckIcon />}
        </span>
        <b className="sq-toast-title">{item.title}</b>
        <button
          type="button"
          className="sq-toast-close"
          aria-label="Dismiss"
          onClick={() => onDismiss(item.id)}
        >
          <CloseIcon />
        </button>
      </div>
      {item.detail && <span className="sq-toast-detail">{item.detail}</span>}
      {item.actions && item.actions.length > 0 && (
        <div className="sq-toast-actions">
          {item.actions.map((action) => (
            <ActionButton
              key={action.label}
              action={{
                ...action,
                onClick: () => {
                  action.onClick?.();
                  onDismiss(item.id);
                },
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Mounts the toast host once (in the root layout). Toasts are ink cards,
 * bottom-right on desktop and above the tab bar on phones (shell.css).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, dispatch] = useReducer(toastReducer, []);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => dispatch({ type: "dismiss", id }),
    []
  );
  const toast = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    dispatch({ type: "add", toast: { ...input, id } });
    return id;
  }, []);
  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="sq-toast-viewport" role="region" aria-label="Notifications">
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
