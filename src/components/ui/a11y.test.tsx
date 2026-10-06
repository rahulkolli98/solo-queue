import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Drawer from "@/components/ui/Drawer";
import { toastRole } from "@/components/ui/Toast";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("Drawer accessible name", () => {
  it("is a dialog named by its eyebrow and title together once open", () => {
    const out = html(
      <Drawer open onClose={() => {}} title="Why staking money beats streaks" eyebrow="Threads · Tue 6 Oct, 19:00">
        <p>body</p>
      </Drawer>
    );
    const labelledby = /aria-labelledby="([^"]+)"/.exec(out)?.[1] ?? "";
    const [eyebrowId, titleId] = labelledby.split(" ");
    expect(eyebrowId).toBeTruthy();
    expect(titleId).toBeTruthy();
    expect(out).toContain(`id="${eyebrowId}">Threads · Tue 6 Oct, 19:00<`);
    expect(out).toContain(`id="${titleId}">Why staking money beats streaks<`);
    expect(out).toContain('aria-label="Why staking money beats streaks"');
  });

  it("is named by the title alone without an eyebrow, and has no dangling reference while closed", () => {
    const open = html(
      <Drawer open onClose={() => {}} title="Attach media">
        <p>body</p>
      </Drawer>
    );
    expect(/aria-labelledby="([^" ]+)"/.exec(open)?.[1]).toBeTruthy();
    const closed = html(
      <Drawer open={false} onClose={() => {}} title="Attach media" eyebrow="Instagram">
        <p>body</p>
      </Drawer>
    );
    expect(closed).not.toContain("aria-labelledby");
    expect(closed).toContain('aria-label="Attach media"');
  });
});

describe("toastRole", () => {
  it("interrupts for a failure and waits its turn for a confirmation", () => {
    expect(toastRole("bad")).toBe("alert");
    expect(toastRole("ok")).toBe("status");
    expect(toastRole(undefined)).toBe("status");
  });
});
