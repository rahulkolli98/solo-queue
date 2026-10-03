import { limitActions, type Action } from "@/components/ui/ActionButton";

/** How long a toast stays before it dismisses itself (ms). */
export const TOAST_MS = 6000;
/** At most this many toasts are on screen; the oldest is dropped first. */
export const MAX_TOASTS = 3;

export interface ToastInput {
  /** Terse success or failure line ("Week queued: 4 Threads, 3 Instagram"). */
  title: string;
  detail?: string;
  /** "ok" (default) or "bad". */
  tone?: "ok" | "bad";
  /** At most two are kept. */
  actions?: Action[];
}

export interface ToastItem extends ToastInput {
  id: number;
}

export type ToastEvent =
  | { type: "add"; toast: ToastItem }
  | { type: "dismiss"; id: number };

export function toastReducer(state: ToastItem[], event: ToastEvent): ToastItem[] {
  switch (event.type) {
    case "add": {
      const toast = { ...event.toast, actions: limitActions(event.toast.actions) };
      return [...state, toast].slice(-MAX_TOASTS);
    }
    case "dismiss":
      return state.filter((t) => t.id !== event.id);
  }
}
