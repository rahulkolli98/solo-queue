/**
 * A small, safe Markdown reader for blog drafts. It turns the text into plain
 * data (blocks and inline runs); the component renders that data as React
 * elements, so nothing is ever injected as HTML. Only the subset a blog draft
 * uses is understood:
 *
 *   - headings `#`, `##`, `###` (deeper levels are shown as level 3)
 *   - paragraphs (a single new line inside one stays a line break)
 *   - ordered (`1.`) and unordered (`-`, `*`, `+`) lists
 *   - **bold**, *italic* / _italic_, `code`
 *   - links `[label](url)`, shown as their label only
 *
 * Anything else is kept as plain text, so no words are ever dropped.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; children: Inline[] }
  | { type: "break" };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: Inline[][] };

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const ORDERED = /^ {0,3}(\d{1,9})[.)][ \t]+(.*)$/;
const BULLET = /^ {0,3}[-*+][ \t]+(.*)$/;

/** The inline patterns, tried in this order at each position (earliest match wins; ties go to the first). */
const INLINE_PATTERNS: { re: RegExp; build: (m: RegExpExecArray) => Inline }[] = [
  { re: /`([^`\n]+)`/, build: (m) => ({ type: "code", text: m[1] }) },
  { re: /\[([^\]\n]+)\]\(([^)\s]*)\)/, build: (m) => ({ type: "link", children: parseInline(m[1]) }) },
  { re: /\*\*(?=\S)(.+?)(?<=\S)\*\*/, build: (m) => ({ type: "strong", children: parseInline(m[1]) }) },
  { re: /(?<![\w_])__(?=\S)(.+?)(?<=\S)__(?![\w_])/, build: (m) => ({ type: "strong", children: parseInline(m[1]) }) },
  { re: /\*(?=[^\s*])(.+?)(?<=[^\s*])\*/, build: (m) => ({ type: "em", children: parseInline(m[1]) }) },
  { re: /(?<![\w_])_(?=[^\s_])(.+?)(?<=[^\s_])_(?![\w_])/, build: (m) => ({ type: "em", children: parseInline(m[1]) }) },
];

/** Bold, italic, code and link runs inside one line of text. Unmatched markers stay as literal text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest.length > 0) {
    let best: { index: number; length: number; node: Inline } | undefined;
    for (const { re, build } of INLINE_PATTERNS) {
      const m = re.exec(rest);
      if (m && (best === undefined || m.index < best.index)) {
        best = { index: m.index, length: m[0].length, node: build(m) };
      }
    }
    if (!best) {
      out.push({ type: "text", text: rest });
      break;
    }
    if (best.index > 0) out.push({ type: "text", text: rest.slice(0, best.index) });
    out.push(best.node);
    rest = rest.slice(best.index + best.length);
  }
  return out;
}

/** Several lines of one paragraph, with a line break between them. */
function inlineLines(lines: string[]): Inline[] {
  const out: Inline[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push({ type: "break" });
    out.push(...parseInline(line.trim()));
  });
  return out;
}

function isBlockStart(line: string): boolean {
  return HEADING.test(line) || ORDERED.test(line) || BULLET.test(line);
}

/** Markdown text to blocks. Empty or blank text gives no blocks. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: "heading",
        level: Math.min(heading[1].length, 3) as 1 | 2 | 3,
        children: parseInline(heading[2].trim()),
      });
      i += 1;
      continue;
    }

    const ordered = ORDERED.exec(line);
    const bullet = ordered ? null : BULLET.exec(line);
    if (ordered || bullet) {
      const isOrdered = Boolean(ordered);
      const marker = isOrdered ? ORDERED : BULLET;
      const items: Inline[][] = [];
      const start = ordered ? Number(ordered[1]) : 1;
      while (i < lines.length) {
        const m = marker.exec(lines[i]);
        if (!m) break;
        const itemLines = [isOrdered ? m[2] : m[1]];
        i += 1;
        // An indented line right below continues the same item.
        while (i < lines.length && /^ {2,}\S/.test(lines[i]) && !isBlockStart(lines[i])) {
          itemLines.push(lines[i]);
          i += 1;
        }
        items.push(inlineLines(itemLines));
        // A blank line between two items of the same list does not end it.
        let j = i;
        while (j < lines.length && !lines[j].trim()) j += 1;
        if (j > i && j < lines.length && marker.test(lines[j])) i = j;
      }
      blocks.push({ type: "list", ordered: isOrdered, start, items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !(para.length > 0 && isBlockStart(lines[i]))) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "paragraph", children: inlineLines(para) });
  }
  return blocks;
}
