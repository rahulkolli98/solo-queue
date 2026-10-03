import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Drawer from "@/components/ui/Drawer";
import FilterChip from "@/components/ui/FilterChip";
import FormField from "@/components/ui/FormField";
import PageHeader from "@/components/ui/PageHeader";
import SegmentedControl from "@/components/ui/SegmentedControl";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("PageHeader", () => {
  it("renders the eyebrow, kicker, headline with its accent word, aside and actions", () => {
    const out = html(
      <PageHeader
        eyebrow="Queue"
        kicker="Three weeks"
        headline={
          <>
            Already <em>written.</em>
          </>
        }
        aside="Every open slot is a gap."
        actions={<button>New</button>}
      />
    );
    expect(out).toContain("Queue");
    expect(out).toContain("Three weeks");
    expect(out).toContain("<em>written.</em>");
    expect(out).toContain("Every open slot is a gap.");
    expect(out).toContain("<button>New</button>");
    expect(out).toContain("<h1");
  });

  it("omits the side column when there is no aside or actions", () => {
    expect(html(<PageHeader headline="Solo" />)).not.toContain("sq-pageheader-side");
  });
});

describe("SegmentedControl", () => {
  it("is a labelled group whose current option is pressed", () => {
    const out = html(
      <SegmentedControl
        label="Platform"
        value="b"
        onChange={() => {}}
        options={[
          { value: "a", label: "Both" },
          { value: "b", label: "Threads", count: 3 },
        ]}
      />
    );
    expect(out).toContain('role="group"');
    expect(out).toContain('aria-label="Platform"');
    expect(out).toMatch(/aria-pressed="false"[^>]*>Both/);
    expect(out).toMatch(/aria-pressed="true"[^>]*>Threads/);
    expect(out).toContain("sq-seg-on");
    expect(out).toContain(">3<");
  });
});

describe("FilterChip", () => {
  it("exposes pressed state and an optional colour swatch", () => {
    const on = html(<FilterChip pressed onClick={() => {}} swatch="pillar-tools">AI</FilterChip>);
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain("--color-pillar-tools");
    expect(html(<FilterChip pressed={false} onClick={() => {}}>All</FilterChip>)).toContain('aria-pressed="false"');
  });
});

describe("FormField", () => {
  it("links the label to the control", () => {
    const out = html(
      <FormField label="Title" hint="Short and plain">
        <input />
      </FormField>
    );
    const id = /for="([^"]+)"/.exec(out)?.[1];
    expect(id).toBeTruthy();
    expect(out).toContain(`id="${id}"`);
    expect(out).toContain(`aria-describedby="${id}-hint"`);
    expect(out).toContain("Short and plain");
  });

  it("shows the error as an alert, marks the control invalid and hides the hint", () => {
    const out = html(
      <FormField label="Title" hint="Short and plain" error="Give the topic a title.">
        <input />
      </FormField>
    );
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain("sq-input-error");
    expect(out).toContain('role="alert"');
    expect(out).toContain("Give the topic a title.");
    expect(out).not.toContain("Short and plain");
  });
});

describe("Drawer", () => {
  it("renders a labelled dialog and no content while closed", () => {
    const out = html(
      <Drawer open={false} onClose={() => {}} title="Slot details">
        <p>secret body</p>
      </Drawer>
    );
    expect(out).toContain("<dialog");
    expect(out).toContain('aria-label="Slot details"');
    expect(out).not.toContain("secret body");
  });

  it("renders the title, close button, content and footer when open", () => {
    const out = html(
      <Drawer open onClose={() => {}} title="Slot details" eyebrow="Threads" footer={<button>Retry</button>}>
        <p>body text</p>
      </Drawer>
    );
    expect(out).toContain("Slot details");
    expect(out).toContain('aria-label="Close"');
    expect(out).toContain("body text");
    expect(out).toContain("<button>Retry</button>");
  });
});
