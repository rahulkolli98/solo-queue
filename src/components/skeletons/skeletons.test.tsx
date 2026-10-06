import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LibrarySkeleton from "@/components/skeletons/LibrarySkeleton";
import QueueSkeleton from "@/components/skeletons/QueueSkeleton";
import ResearchSkeleton from "@/components/skeletons/ResearchSkeleton";
import StudioSkeleton from "@/components/skeletons/StudioSkeleton";
import TodayDateLine, { dateLineParts } from "@/components/skeletons/TodayDateLine";
import TodaySkeleton from "@/components/skeletons/TodaySkeleton";

/**
 * TASK-086: the loading skeletons match the desktop and phone boards, keep the
 * real static chrome the boards keep, and never push a phone wider than its screen.
 */
const html = (node: React.ReactElement) => renderToStaticMarkup(node);
const css = readFileSync(resolve(import.meta.dirname, "../../styles/skeletons.css"), "utf8");

const SCREENS: [string, React.ReactElement][] = [
  ["Today", <TodaySkeleton key="t" />],
  ["Studio", <StudioSkeleton key="s" />],
  ["Queue", <QueueSkeleton key="q" />],
  ["Research", <ResearchSkeleton key="r" />],
  ["Library", <LibrarySkeleton key="l" />],
];

/** The markup from the phone variant's opening tag to the end. */
const phoneHtml = (el: React.ReactElement) => {
  const out = html(el);
  return out.slice(out.indexOf('class="sq-skel-phone"'));
};

/* ---------- a tiny HTML tree, enough to look at one element's children ---------- */
interface TreeNode {
  tag: string;
  attrs: string;
  children: TreeNode[];
}
const VOID = new Set(["br", "img", "input", "hr", "meta", "link"]);

function parse(markup: string): TreeNode {
  const root: TreeNode = { tag: "#root", attrs: "", children: [] };
  const stack = [root];
  for (const m of markup.matchAll(/<(\/)?([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/)?>/g)) {
    const [, closing, tag, attrs, selfClosing] = m;
    if (closing) {
      stack.pop();
      continue;
    }
    const node: TreeNode = { tag, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing && !VOID.has(tag)) stack.push(node);
  }
  return root;
}

function classes(node: TreeNode): string[] {
  return (/class="([^"]*)"/.exec(node.attrs)?.[1] ?? "").split(/\s+/);
}

function find(node: TreeNode, className: string): TreeNode | undefined {
  if (classes(node).includes(className)) return node;
  for (const child of node.children) {
    const hit = find(child, className);
    if (hit) return hit;
  }
  return undefined;
}

function walk(node: TreeNode, visit: (n: TreeNode) => void) {
  visit(node);
  node.children.forEach((c) => walk(c, visit));
}

/** The px width an element asks for; a single-child wrapper that cannot shrink asks for its child's. */
function fixedWidth(node: TreeNode): number {
  const own = /style="(?:[^"]*;)?width:(\d+(?:\.\d+)?)px/.exec(node.attrs);
  if (own) return Number(own[1]);
  if (node.children.length === 1 && classes(node).some((c) => c === "sq-skel-noshrink" || c === "sq-skel-stub")) {
    return fixedWidth(node.children[0]);
  }
  return 0;
}

const phoneTree = (el: React.ReactElement) => {
  const node = find(parse(html(el)), "sq-skel-phone");
  if (!node) throw new Error("no phone variant");
  return node;
};

describe("every loading skeleton", () => {
  it.each(SCREENS)("%s is a busy region with one status line and no interactive element", (_n, el) => {
    const out = html(el);
    expect(out).toContain('aria-busy="true"');
    expect(out.match(/role="status"/g)).toHaveLength(1);
    expect(out).not.toMatch(/<(a|button|input|select|textarea)[\s>]/);
    expect(out).not.toContain("href=");
    expect(out).not.toContain("tabindex");
  });

  it.each(SCREENS)("%s draws a desktop variant and a separate phone variant", (_n, el) => {
    const out = html(el);
    expect(out).toContain('class="sq-skel-desk"');
    expect(out).toContain('class="sq-skel-phone"');
  });
});

describe("the phone variants never ask for more than a 360px phone has", () => {
  // 360 wide minus the 16px gutters; the frames strip scrolls on purpose and clips itself.
  const AVAILABLE = 360 - 2 * 16;

  it.each(SCREENS)("%s: fixed-width siblings in a row fit", (_n, el) => {
    walk(phoneTree(el), (node) => {
      if (classes(node).includes("sq-skel-strip")) return;
      const widths = node.children.map(fixedWidth).filter((w) => w > 0);
      if (widths.length < 2) return;
      const gaps = (node.children.length - 1) * 8;
      expect(widths.reduce((a, b) => a + b, 0) + gaps).toBeLessThanOrEqual(AVAILABLE);
    });
  });

  it.each(SCREENS)("%s: no single shape is wider than the phone", (_n, el) => {
    walk(phoneTree(el), (node) => expect(fixedWidth(node)).toBeLessThanOrEqual(AVAILABLE));
  });

  it("the check is not vacuous: it sees the fixed-width rows the phone boards do have", () => {
    let rows = 0;
    for (const [, el] of SCREENS) {
      walk(phoneTree(el), (node) => {
        if (node.children.map(fixedWidth).filter((w) => w > 0).length >= 2) rows++;
      });
    }
    // Today's two 90px blocks, Research's four chips, Library's three strip chips, Studio's 100px action
    expect(rows).toBeGreaterThanOrEqual(3);
  });

  it("the stylesheet hides the desktop variant and shows the phone one at the phone breakpoint", () => {
    const at = css.indexOf("@media (max-width: 767px)");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(0, at)).toMatch(/\.sq-skel-phone\s*\{\s*display:\s*none/);
    expect(css.slice(at)).toMatch(/\.sq-skel-desk\s*\{\s*display:\s*none/);
    expect(css.slice(at)).toMatch(/\.sq-skel-phone\s*\{[^}]*display:\s*flex/);
  });
});

describe("Queue (boards 08c and M08c)", () => {
  it("desktop keeps the real toolbar, as static labels", () => {
    const out = html(<QueueSkeleton />);
    const toolbar = out.slice(out.indexOf('class="sq-skel-topbar"'), out.indexOf('class="sq-skel-header"'));
    for (const label of ["Week", "3 weeks", "Month", "Both", "Threads", "Instagram", "Slot rules"]) {
      expect(toolbar).toContain(`>${label}</span>`);
    }
    expect(toolbar).toContain("New from topic</span>");
    expect(toolbar).toContain('aria-hidden="true"');
  });

  it("phone has no toolbar: a lead line, seven 64px day pills, an eyebrow and four agenda rows", () => {
    const phone = phoneHtml(<QueueSkeleton />);
    expect(phone).not.toContain("Slot rules");
    expect(phone).not.toContain("sq-segs");
    expect(phone).toContain("width:80%;height:15px");
    expect(find(phoneTree(<QueueSkeleton />), "sq-skel-daypills")?.children).toHaveLength(7);
    expect(phone.match(/height:64px;border-radius:16px/g)).toHaveLength(7);
    expect(phone).toContain("width:50%;height:11px");
    const heights = [...phone.matchAll(/class="sq-skel-grow"><span class="sq-sk"[^>]*?height:(\d+)px/g)].map((m) => Number(m[1]));
    expect(heights).toEqual([74, 128, 74, 60]);
    expect(phone).toContain("rotate(-0.8deg)");
    expect(phone.match(/width:42px;height:12px/g)).toHaveLength(4);
  });
});

describe("Library (boards 08e and M08e)", () => {
  it("shows the real tab labels, without counts, on both variants", () => {
    const out = html(<LibrarySkeleton />);
    for (const label of ["Published", "Drafts", "Story frames", "Frames", "Media"]) expect(out).toContain(`>${label}<`);
    expect(out).not.toContain("lb-tab-count");
    expect(out.match(/aria-current="page"/g)).toHaveLength(2);
  });

  it("marks the tab of the route it loads for", () => {
    const out = html(<LibrarySkeleton tab="drafts" />);
    expect(out).toMatch(/aria-current="page"[^>]*><span class="lb-tab-long">Drafts</);
  });

  it("desktop keeps the search field and the Pillar / Platform filters", () => {
    const out = html(<LibrarySkeleton />);
    expect(out).toContain("Search everything you");
    expect(out).toContain("Pillar · All");
    expect(out).toContain("Platform · Both");
  });

  it("phone: tabs, a SWIPE strip of three 150x58 chips, four 232px postcards, no rail", () => {
    const phone = phoneHtml(<LibrarySkeleton />);
    expect(phone).toContain("lb-tabs");
    expect(phone).toContain("width:30%;height:10px");
    expect(phone.match(/width:150px;height:58px;border-radius:14px/g)).toHaveLength(3);
    expect(phone.match(/sq-skel-postcard-m/g)).toHaveLength(4);
    expect(phone).not.toContain("sq-skel-rail");
    expect(phone).not.toContain("sq-skel-header");
    expect(css).toMatch(/\.sq-skel-postcard-m\s*\{[^}]*height:\s*232px/);
  });
});

describe("Research (boards 08d and M08d)", () => {
  it("desktop keeps the crumb and the capture field and button", () => {
    const out = html(<ResearchSkeleton />);
    expect(out).toContain("Research / Inbox");
    expect(out).toContain("Paste a link, a quote, or a half-thought…");
    expect(out).toContain(">Save to inbox<");
  });

  it("phone: capture form, four 36px chips, the yellow topic card, then two rows; no statement", () => {
    const phone = phoneHtml(<ResearchSkeleton />);
    const capture = phone.indexOf("sq-skel-capture ");
    const chips = phone.indexOf("height:36px;border-radius:18px");
    const board = phone.indexOf("sq-skel-board-m");
    const rows = phone.indexOf("sq-skel-topic-m");
    expect(capture).toBeGreaterThan(-1);
    expect(capture).toBeLessThan(chips);
    expect(chips).toBeLessThan(board);
    expect(board).toBeLessThan(rows);
    expect(phone.match(/height:36px;border-radius:18px/g)).toHaveLength(4);
    expect(phone.match(/sq-skel-topic-m/g)).toHaveLength(2);
    expect(phone).toContain(">Save<");
    expect(phone).not.toContain("sq-skel-header");
    expect(phone).not.toContain("height:58px");
  });
});

describe("Today (boards 08a and M08a)", () => {
  it("phone: lead line, two 40px headline lines, no explainer, two 20px runway rows without a label column", () => {
    const phone = phoneHtml(<TodaySkeleton />);
    expect(phone).not.toContain("New from topic");
    expect(phone).not.toContain("sq-skel-header");
    expect(phone).toContain("width:46%;height:16px");
    expect(phone.match(/height:40px/g)).toHaveLength(2);
    expect(phone.match(/class="sq-skel-runway-m"/g)).toHaveLength(2);
    expect(phone.match(/height:20px;border-radius:4px/g)).toHaveLength(42);
    expect(phone).not.toContain('class="sq-skel-runway"');
  });

  it("desktop keeps the New from topic button, static", () => {
    const out = html(<TodaySkeleton />);
    expect(out).toContain("New from topic");
    expect(out).not.toContain("href=");
  });

  it("the date line is the real helper's output and is a blank shape on the server (no hydration mismatch)", () => {
    expect(dateLineParts(Date.UTC(2026, 8, 25, 10), "UTC")).toEqual({ date: "Friday, 25 September", week: "Week 39" });
    // 20:00 UTC on the 25th is already Saturday in Auckland
    expect(dateLineParts(Date.UTC(2026, 8, 25, 20), "Pacific/Auckland").date).toBe("Saturday, 26 September");
    const server = html(<TodayDateLine />);
    expect(server).not.toMatch(/Week \d/);
    expect(server).toContain("sq-sk");
  });
});

describe("Studio (boards 08b and M08b)", () => {
  it("desktop numbers the Threads posts and rules the scene rows", () => {
    const out = html(<StudioSkeleton />);
    expect(out.match(/class="sq-skel-th"/g)).toHaveLength(4 + 3);
    expect(out.match(/class="sq-skel-scene"/g)).toHaveLength(5);
  });

  it("phone: topic note, a 46px bar, the thread with three posts and the 48px actions", () => {
    const phone = phoneHtml(<StudioSkeleton />);
    expect(phone).toContain("sq-skel-note-m");
    expect(phone).toContain("height:46px;border-radius:23px");
    expect(phone.match(/class="sq-skel-post sq-skel-post-m"/g)).toHaveLength(3);
    expect(phone.match(/height:48px;border-radius:24px/g)).toHaveLength(2);
    expect(phone).not.toContain("sq-skel-bottombar");
  });
});
