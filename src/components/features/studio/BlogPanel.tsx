"use client";

import { useState } from "react";
import AutoTextarea from "@/components/features/studio/AutoTextarea";
import GenerationErrorCard from "@/components/features/studio/GenerationErrorCard";
import BlogPreview from "@/components/features/studio/BlogPreview";
import ManualDraft from "@/components/features/studio/ManualDraft";
import StudioTabs, { useTabIds } from "@/components/features/studio/StudioTabs";
import type { DraftView, GenState } from "@/components/features/studio/types";
import SegmentedControl from "@/components/ui/SegmentedControl";
import { markdownFilename, wordCount } from "@/lib/draftText";

export type BlogTabId = "threads" | "reel" | "caption" | "blog";

/** Board 07f: the wide blog card with the draft tabs, Copy markdown and Download .md. */
export default function BlogPanel({
  view,
  topicTitle,
  threadsCount,
  onTab,
  gen,
  onWrite,
  writing,
  onSaveManual,
  defaultEditing = false,
}: {
  view?: DraftView;
  topicTitle: string | undefined;
  threadsCount: number;
  onTab: (tab: Exclude<BlogTabId, "blog">) => void;
  gen: GenState;
  /** Generate just the blog draft. */
  onWrite: () => void;
  /** Any generation is running. */
  writing: boolean;
  /** Store the "Write it myself" text as the topic's blog draft. */
  onSaveManual?: (text: string) => Promise<void>;
  /** Open on the markdown text instead of the article preview. */
  defaultEditing?: boolean;
}) {
  const { tabId, panelId } = useTabIds();
  const [copied, setCopied] = useState<"idle" | "copied" | "failed">("idle");
  const [manual, setManual] = useState(false);
  // The draft reads as an article by default; "Edit" reveals the markdown text (it autosaves as before).
  const [editing, setEditing] = useState(defaultEditing);

  async function copy() {
    if (!view) return;
    try {
      await navigator.clipboard.writeText(view.body);
      setCopied("copied");
      setTimeout(() => setCopied("idle"), 2000);
    } catch {
      setCopied("failed");
    }
  }

  function download() {
    if (!view) return;
    // Byte-identical export: the body goes into the file untouched.
    const blob = new Blob([view.body], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = markdownFilename(topicTitle);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  let content;
  if (gen.writing) {
    content = (
      <div aria-busy="true" className="studio-skel studio-skel-block">
        <span className="sq-sk studio-sk-line" data-w="60" />
        <span className="sq-sk studio-sk-line" />
        <span className="sq-sk studio-sk-line" data-w="88" />
        <span className="sq-sk studio-sk-line" data-w="72" />
        <span className="t-mono studio-foot-hot">WRITING THE BLOG DRAFT… {gen.elapsed}</span>
      </div>
    );
  } else if (view) {
    // An empty draft has nothing to preview, so it opens straight on the text.
    const showText = editing || !view.body.trim();
    content = (
      <>
        <div className="studio-article-top">
          <span className="t-meta studio-article-label">
            BLOG DRAFT · MARKDOWN · {wordCount(view.body)} WORDS · NOT POSTED, FOR YOUR SITE OR NEWSLETTER
          </span>
          <SegmentedControl
            label="Blog draft view"
            value={showText ? "edit" : "preview"}
            onChange={(v) => setEditing(v === "edit")}
            options={[
              { value: "preview", label: "Preview" },
              { value: "edit", label: "Edit" },
            ]}
          />
        </div>
        {showText ? (
          <AutoTextarea
            className="studio-textarea studio-textarea-blog"
            aria-label="Blog draft (markdown)"
            value={view.body}
            onChange={(e) => view.onChange(e.target.value)}
            onBlur={view.onBlur}
          />
        ) : (
          <BlogPreview body={view.body} />
        )}
      </>
    );
  } else if (gen.error) {
    content = manual ? (
      <ManualDraft label="Blog draft" onSave={onSaveManual} onRetry={gen.onRetry} retrying={gen.retrying} />
    ) : (
      <GenerationErrorCard
        title="Couldn't write the blog draft"
        message={gen.error}
        code={gen.errorCode}
        onRetry={gen.onRetry}
        busy={gen.retrying}
        onWriteMyself={() => setManual(true)}
      />
    );
  } else {
    content = (
      <div className="studio-blog-empty">
        <p className="studio-empty-copy">No blog draft yet. It is optional and never queued.</p>
        <div>
          <button type="button" className="sq-btn sq-btn-sm sq-btn-dark" onClick={onWrite} disabled={writing}>
            Write the blog draft
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="studio-col studio-col-blog" aria-label="Blog draft">
      <div className="studio-blog-head">
        <StudioTabs<BlogTabId>
          className="studio-blog-tabs"
          label="Draft"
          value="blog"
          tabId={tabId}
          panelId={panelId}
          onChange={(id) => id !== "blog" && onTab(id)}
          tabs={[
            { id: "threads", label: `Threads · ${threadsCount}` },
            { id: "reel", label: "IG reel" },
            { id: "caption", label: "IG caption" },
            { id: "blog", label: "Blog" },
          ]}
        />
        <div className="studio-actions-row">
          {view && (
            <button
              type="button"
              className="sq-btn sq-btn-sm"
              disabled={writing}
              aria-label="Regenerate the blog draft"
              onClick={onWrite}
            >
              Regenerate
            </button>
          )}
          <button type="button" className="sq-btn sq-btn-sm" onClick={() => void copy()} disabled={!view}>
            Copy markdown
          </button>
          <button type="button" className="sq-btn sq-btn-sm sq-btn-dark" onClick={download} disabled={!view}>
            Download .md
          </button>
          <span className="t-meta" role="status">
            {copied === "copied" ? "COPIED" : copied === "failed" ? "COPY FAILED · SELECT THE TEXT" : ""}
          </span>
        </div>
      </div>
      <article className="studio-article" role="tabpanel" id={panelId("blog")} aria-labelledby={tabId("blog")}>
        {content}
      </article>
    </section>
  );
}
