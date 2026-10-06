import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "@/lib/studioMarkdown";

describe("parseMarkdown", () => {
  it("reads headings, paragraphs and lists", () => {
    const blocks = parseMarkdown("# Title\n\nLede here.\n\n## The setup\n\n- one\n- two\n\n1. first\n2. second");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "heading", "list", "list"]);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1 });
    expect(blocks[2]).toMatchObject({ type: "heading", level: 2 });
    expect(blocks[3]).toMatchObject({ type: "list", ordered: false });
    expect(blocks[4]).toMatchObject({ type: "list", ordered: true, start: 1 });
    expect((blocks[3] as { items: unknown[] }).items).toHaveLength(2);
  });

  it("ends a heading at its own line, even with text right below it (no blank line)", () => {
    const blocks = parseMarkdown("## The setup\nI started Monday.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 2 });
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
  });

  it("shows deeper headings as level 3 and strips closing hashes", () => {
    const [h] = parseMarkdown("##### Small ##");
    expect(h).toMatchObject({ type: "heading", level: 3, children: [{ type: "text", text: "Small" }] });
  });

  it("opens a blog draft the way the model writes it: a plain list of headlines, then the lede", () => {
    const blocks = parseMarkdown("1. A\n2. B\n3. C\n\nLede.");
    expect(blocks[0]).toMatchObject({ type: "list", ordered: true });
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(3);
    expect(blocks[1]).toMatchObject({ type: "paragraph" });
  });

  it("keeps an ordered list's first number and joins items split by a blank line", () => {
    const [list] = parseMarkdown("3. three\n\n4. four");
    expect(list).toMatchObject({ type: "list", ordered: true, start: 3 });
    expect((list as { items: unknown[] }).items).toHaveLength(2);
  });

  it("keeps a single new line inside a paragraph as a line break", () => {
    const [p] = parseMarkdown("line one\nline two");
    expect(p).toMatchObject({ type: "paragraph" });
    expect((p as { children: { type: string }[] }).children.map((c) => c.type)).toEqual(["text", "break", "text"]);
  });

  it("folds an indented line into the list item above it", () => {
    const [list] = parseMarkdown("- first\n  still first\n- second");
    expect((list as { items: unknown[] }).items).toHaveLength(2);
  });

  it("gives nothing for blank text and handles Windows line ends", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("  \n\n ")).toEqual([]);
    expect(parseMarkdown("# A\r\n\r\nB")).toHaveLength(2);
  });

  it("never drops words: unknown syntax stays as text", () => {
    const [p] = parseMarkdown("> a quote with <b>tags</b> and | pipes |");
    expect(JSON.stringify(p)).toContain("<b>tags</b>");
  });
});

describe("parseInline", () => {
  it("reads bold, italic and code", () => {
    expect(parseInline("a **b** *c* _d_ `e`")).toEqual([
      { type: "text", text: "a " },
      { type: "strong", children: [{ type: "text", text: "b" }] },
      { type: "text", text: " " },
      { type: "em", children: [{ type: "text", text: "c" }] },
      { type: "text", text: " " },
      { type: "em", children: [{ type: "text", text: "d" }] },
      { type: "text", text: " " },
      { type: "code", text: "e" },
    ]);
  });

  it("shows a link as its label and keeps the address out of the text", () => {
    const nodes = parseInline("see [the docs](https://example.com/x) now");
    expect(nodes[1]).toEqual({ type: "link", children: [{ type: "text", text: "the docs" }] });
    expect(JSON.stringify(nodes)).not.toContain("example.com");
  });

  it("leaves unmatched markers and snake_case words alone", () => {
    expect(parseInline("2 * 3 and snake_case_name and **open")).toEqual([
      { type: "text", text: "2 * 3 and snake_case_name and **open" },
    ]);
  });

  it("does not format inside code", () => {
    expect(parseInline("`**x**`")).toEqual([{ type: "code", text: "**x**" }]);
  });

  it("nests italic inside bold", () => {
    const [strong] = parseInline("**a *b* c**");
    expect(strong).toMatchObject({ type: "strong" });
    expect((strong as { children: { type: string }[] }).children.map((c) => c.type)).toEqual(["text", "em", "text"]);
  });
});
