import { describe, expect, it } from "vitest";
import { MAX_TOASTS, toastReducer, type ToastItem } from "./toast";

const toast = (id: number, extra: Partial<ToastItem> = {}): ToastItem => ({
  id,
  title: `toast ${id}`,
  ...extra,
});

describe("toastReducer", () => {
  it("adds toasts in order", () => {
    let state: ToastItem[] = [];
    state = toastReducer(state, { type: "add", toast: toast(1) });
    state = toastReducer(state, { type: "add", toast: toast(2) });
    expect(state.map((t) => t.id)).toEqual([1, 2]);
  });

  it("keeps only the newest MAX_TOASTS", () => {
    let state: ToastItem[] = [];
    for (let id = 1; id <= MAX_TOASTS + 2; id++) {
      state = toastReducer(state, { type: "add", toast: toast(id) });
    }
    expect(state).toHaveLength(MAX_TOASTS);
    expect(state[state.length - 1].id).toBe(MAX_TOASTS + 2);
    expect(state.some((t) => t.id === 1)).toBe(false);
  });

  it("keeps at most two actions", () => {
    const actions = [
      { label: "a" },
      { label: "b" },
      { label: "c" },
    ];
    const state = toastReducer([], { type: "add", toast: toast(1, { actions }) });
    expect(state[0].actions?.map((a) => a.label)).toEqual(["a", "b"]);
  });

  it("dismisses by id and ignores unknown ids", () => {
    const start = [toast(1), toast(2)];
    expect(toastReducer(start, { type: "dismiss", id: 1 }).map((t) => t.id)).toEqual([2]);
    expect(toastReducer(start, { type: "dismiss", id: 99 })).toHaveLength(2);
  });
});
