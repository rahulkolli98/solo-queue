import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("convex/react", () => ({
  useConvex: () => ({ query: vi.fn() }),
  useQuery: () => undefined,
  useMutation: () => vi.fn(),
  useAction: () => vi.fn(),
}));
vi.mock("../../../../convex/_generated/api", () => ({
  api: {
    dataTools: {
      exportPostsCsv: "dataTools.exportPostsCsv",
      exportAllJson: "dataTools.exportAllJson",
      disconnectAll: "dataTools.disconnectAll",
      deleteEverything: "dataTools.deleteEverything",
    },
  },
}));

import DataSection from "./DataSection";
import { DeleteEverythingDialog, DisconnectDialog } from "./DataDialogs";

const noop = () => {};

describe("DataSection", () => {
  it("shows both export buttons and says exports never include tokens", () => {
    const out = renderToStaticMarkup(<DataSection />);
    expect(out).toContain("Download posts (CSV)");
    expect(out).toContain("Download everything (JSON)");
    expect(out).toContain("Exports never include account tokens.");
  });

  it("shows the disconnect and delete entry buttons, with the dialogs closed", () => {
    const out = renderToStaticMarkup(<DataSection />);
    expect(out).toContain("Disconnect all accounts");
    expect(out).toContain("st-btn-danger");
    expect(out).toMatch(/<button[^>]*st-btn-danger[^>]*>Delete everything<\/button>/);
    expect(out).not.toContain("<dialog");
  });
});

describe("DisconnectDialog", () => {
  it("explains what is removed and offers Cancel and Disconnect", () => {
    const out = renderToStaticMarkup(<DisconnectDialog busy={false} error="" onConfirm={noop} onClose={noop} />);
    expect(out).toContain("<dialog");
    expect(out).toContain("This removes the saved sign-ins for Threads and Instagram.");
    expect(out).toContain("Queued posts will fail until you connect again.");
    expect(out).toContain("revoke access in your Meta account settings");
    expect(out).toContain(">Cancel<");
    expect(out).toContain(">Disconnect<");
  });

  it("shows a refusal as an alert and a busy state on the button", () => {
    const out = renderToStaticMarkup(<DisconnectDialog busy error="Nope." onConfirm={noop} onClose={noop} />);
    expect(out).toContain('role="alert"');
    expect(out).toContain("Nope.");
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Disconnecting…<\/button>/);
  });
});

describe("DeleteEverythingDialog", () => {
  const render = (props: { busy?: boolean; error?: string } = {}) =>
    renderToStaticMarkup(
      <DeleteEverythingDialog busy={props.busy ?? false} error={props.error ?? ""} onConfirm={noop} onClose={noop} />
    );

  it("explains the loss, suggests the export and asks for the word DELETE", () => {
    const out = render();
    expect(out).toContain("permanently deletes your topics, sources, drafts, queue, media files, frames, templates, settings and connections");
    expect(out).toContain("cannot be undone");
    expect(out).toContain("Download the export first");
    expect(out).toContain("Type DELETE to confirm");
  });

  it("starts with the confirm button disabled (the box is empty)", () => {
    const out = render();
    expect(out).toMatch(/<button type="submit" form="st-delete-form"[^>]*disabled=""[^>]*>Delete everything<\/button>/);
    expect(out).toMatch(/<input id="st-delete-confirm"[^>]*value=""/);
  });

  it("shows progress and a refusal", () => {
    expect(render({ busy: true })).toContain("Deleting…");
    const out = render({ error: "Type DELETE to confirm." });
    expect(out).toContain('role="alert"');
  });
});
