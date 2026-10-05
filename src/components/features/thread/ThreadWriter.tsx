"use client";

import { useState } from "react";
import AutoTextarea from "@/components/features/studio/AutoTextarea";
import { MAX_THREAD_POSTS, THREADS_POST_LIMIT, addPost, movePost, postLength, removePost } from "@/lib/draftText";

/**
 * Write a thread post by post: add, remove and reorder posts, with a live
 * N / 500 counter on each. Used wherever the founder writes a thread
 * themselves (Studio's "Write it myself" and the Research topic board). It
 * holds no state of its own about the text: the parent owns `posts` and decides
 * when and how to save.
 */
export default function ThreadWriter({
  posts,
  onChange,
  idPrefix,
  limit = THREADS_POST_LIMIT,
  disabled = false,
  tone = "paper",
  autoFocus = false,
}: {
  posts: string[];
  onChange: (next: string[]) => void;
  /** Makes the field ids unique when two writers are on one page. */
  idPrefix: string;
  limit?: number;
  disabled?: boolean;
  /** "paper" on cream and yellow surfaces, "dark" inside the dark Threads column. */
  tone?: "paper" | "dark";
  autoFocus?: boolean;
}) {
  // Removing a post that has text asks once more, so a stray click cannot lose it.
  const [confirming, setConfirming] = useState<number | null>(null);
  const atMax = posts.length >= MAX_THREAD_POSTS;

  function setText(index: number, text: string) {
    const next = [...posts];
    next[index] = text;
    onChange(next);
  }

  function remove(index: number) {
    if (posts[index].trim() && confirming !== index) {
      setConfirming(index);
      return;
    }
    setConfirming(null);
    onChange(removePost(posts, index));
  }

  return (
    <div className="sq-tw" data-tone={tone}>
      {posts.map((text, index) => {
        const length = postLength(text);
        const over = length > limit;
        const id = `${idPrefix}-post-${index}`;
        return (
          <div className="sq-tw-post" key={index}>
            <div className="sq-tw-head">
              <label className="t-meta sq-tw-label" htmlFor={id}>
                {index === 0 ? "POST 1 · THE HOOK" : `POST ${index + 1}`}
              </label>
              <span className="sq-tw-tools">
                <button
                  type="button"
                  className="sq-tw-tool"
                  onClick={() => onChange(movePost(posts, index, -1))}
                  disabled={disabled || index === 0}
                  aria-label={`Move post ${index + 1} up`}
                >
                  Up
                </button>
                <button
                  type="button"
                  className="sq-tw-tool"
                  onClick={() => onChange(movePost(posts, index, 1))}
                  disabled={disabled || index === posts.length - 1}
                  aria-label={`Move post ${index + 1} down`}
                >
                  Down
                </button>
                <button
                  type="button"
                  className="sq-tw-tool sq-tw-remove"
                  onClick={() => remove(index)}
                  onBlur={() => setConfirming((c) => (c === index ? null : c))}
                  disabled={disabled || (posts.length === 1 && !text)}
                  aria-label={confirming === index ? `Confirm removing post ${index + 1}` : `Remove post ${index + 1}`}
                >
                  {confirming === index ? "Remove it?" : "Remove"}
                </button>
              </span>
            </div>
            <AutoTextarea
              id={id}
              className="studio-textarea sq-tw-field"
              value={text}
              disabled={disabled}
              autoFocus={autoFocus && index === 0}
              placeholder={index === 0 ? "Write the first post: the hook" : "Write the next post"}
              aria-invalid={over || undefined}
              onChange={(e) => setText(index, e.target.value)}
            />
            <span className="t-meta sq-tw-count" data-over={over || undefined}>
              {length} / {limit}
              {over ? " · OVER THE LIMIT" : ""}
            </span>
          </div>
        );
      })}
      <div className="sq-tw-foot">
        <button type="button" className="sq-btn sq-btn-sm" onClick={() => onChange(addPost(posts))} disabled={disabled || atMax}>
          + Add post
        </button>
        <span className="t-meta">
          {posts.length} / {MAX_THREAD_POSTS} posts
        </span>
      </div>
    </div>
  );
}
