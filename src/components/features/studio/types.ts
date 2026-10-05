import type { Draft } from "@/lib/studioModel";

/** A draft with its on-screen (possibly edited) text and the editing callbacks. */
export interface DraftView {
  draft: Draft;
  body: string;
  onChange: (body: string) => void;
  /** Called when focus leaves the text: saves now and tidies stray blanks. */
  onBlur: () => void;
}

/** Why a column shows its skeleton, error or manual area instead of a draft. */
export interface GenState {
  /** Generation is running and this draft has not landed yet. */
  writing: boolean;
  /** The failure message when this format could not be written. */
  error: string | null;
  /** Refusal code of that failure (LLM_PRIVACY, LLM_AUTH ...), when it has one. */
  errorCode?: string | null;
  elapsed: string;
  onRetry: () => void;
  retrying: boolean;
}
