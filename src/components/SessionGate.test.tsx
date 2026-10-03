import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const auth = { isLoading: false, isAuthenticated: false };
vi.mock("convex/react", () => ({ useConvexAuth: () => auth }));

import SessionGate from "./SessionGate";

const html = () =>
  renderToStaticMarkup(
    <SessionGate>
      <p>The app</p>
    </SessionGate>
  );

describe("SessionGate", () => {
  it("shows a sign-in state while the token is being fetched, and not the app", () => {
    Object.assign(auth, { isLoading: true, isAuthenticated: false });
    const out = html();
    expect(out).toContain("Signing in");
    expect(out).not.toContain("The app");
  });

  it("shows Session ended with a Reload button when the session is not authenticated", () => {
    Object.assign(auth, { isLoading: false, isAuthenticated: false });
    const out = html();
    expect(out).toContain("Session ended");
    expect(out).toContain("Reload");
    expect(out).not.toContain("The app");
  });

  it("renders the app only once Convex has accepted the token", () => {
    Object.assign(auth, { isLoading: false, isAuthenticated: true });
    expect(html()).toContain("The app");
  });
});
