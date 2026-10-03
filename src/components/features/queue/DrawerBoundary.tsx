"use client";

import { Component, type ReactNode } from "react";
import Drawer from "@/components/ui/Drawer";

/**
 * A hand-typed ?slot= value can be rejected by Convex before the query runs.
 * Catch that and show the same "Post not found" panel instead of the error page.
 */
export default class DrawerBoundary extends Component<
  { onClose: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Drawer open onClose={this.props.onClose} eyebrow="Scheduled post" title="Post not found">
        <p className="sq-muted">That link does not point at a post in this queue.</p>
      </Drawer>
    );
  }
}
