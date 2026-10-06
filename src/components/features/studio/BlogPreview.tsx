import { Fragment, type ReactNode } from "react";
import { parseMarkdown, type Inline } from "@/lib/studioMarkdown";

function renderInline(nodes: Inline[]): ReactNode {
  return nodes.map((n, i) => {
    switch (n.type) {
      case "text":
        return <Fragment key={i}>{n.text}</Fragment>;
      case "strong":
        return <strong key={i}>{renderInline(n.children)}</strong>;
      case "em":
        return <em key={i}>{renderInline(n.children)}</em>;
      case "code":
        return <code key={i}>{n.text}</code>;
      case "link":
        // Shown as its words: a draft is for reading here, not for clicking away.
        return <span key={i}>{renderInline(n.children)}</span>;
      case "break":
        return <br key={i} />;
    }
  });
}

/**
 * The blog draft as an article: the markdown the draft is saved as, read and
 * set in type (board 07f). Everything is rendered as React text, never as HTML.
 */
export default function BlogPreview({ body }: { body: string }) {
  const blocks = parseMarkdown(body);
  return (
    <div className="studio-md">
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          const Tag = b.level === 1 ? "h2" : b.level === 2 ? "h3" : "h4";
          return (
            <Tag key={i} className="studio-md-h" data-level={b.level}>
              {renderInline(b.children)}
            </Tag>
          );
        }
        if (b.type === "list") {
          const items = b.items.map((item, j) => <li key={j}>{renderInline(item)}</li>);
          return b.ordered ? (
            <ol key={i} className="studio-md-list" start={b.start}>
              {items}
            </ol>
          ) : (
            <ul key={i} className="studio-md-list">
              {items}
            </ul>
          );
        }
        return (
          <p key={i} className="studio-md-p">
            {renderInline(b.children)}
          </p>
        );
      })}
    </div>
  );
}
