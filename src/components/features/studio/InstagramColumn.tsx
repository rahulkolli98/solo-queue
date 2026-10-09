"use client";

import type { ReactNode } from "react";
import IgPanel, { type IgPanelProps } from "@/components/features/studio/IgPanel";
import { InstagramAvatar } from "@/components/features/studio/glyphs";
import StudioTabs, { useTabIds } from "@/components/features/studio/StudioTabs";
import { instagramFooter } from "@/lib/studioModel";

export type IgTab = "reel" | "caption" | "carousel";

/** What each tab is: three different ways to post on Instagram, each with its own caption. */
const TAB_HINT: Record<IgTab, string> = {
  reel: "A REEL: YOUR VIDEO, WITH THIS SCRIPT AND ITS CAPTION (THE CAPTION IS THE LAST LINE OF THE SCRIPT).",
  caption: "A PHOTO OR VIDEO POST: ONE IMAGE OR VIDEO, WITH THIS CAPTION.",
  carousel: "A CAROUSEL: THE SLIDES BELOW, WITH THIS CAPTION. THE IMAGES ARE DRAWN HERE, NOT ATTACHED.",
};

/** Board 02 / 07c-07e: the cream Instagram column with its Reel script / Caption / Carousel tabs. */
export default function InstagramColumn({
  tab,
  onTab,
  panels,
  carousel,
  draftCount,
  needCount = 0,
  notice,
}: {
  tab: IgTab;
  onTab: (tab: IgTab) => void;
  /** Props for the Reel script and Caption panels. */
  panels: Record<"reel" | "caption", IgPanelProps>;
  /** The Carousel tab's panel (the slide editor), or null when the carousel is not shown. */
  carousel?: ReactNode;
  draftCount: number;
  /** Instagram drafts that cannot be queued yet (over the limit, media, a failed write). */
  needCount?: number;
  /** Phone only: Threads needs the founder ("Threads: 1 draft needs you"). */
  notice?: ReactNode;
}) {
  const { tabId, panelId } = useTabIds();
  return (
    <section className="studio-col studio-col-ig" aria-label="Instagram drafts">
      <div className="studio-colhead">
        <div className="studio-colhead-title">
          <InstagramAvatar />
          <h2 className="t-title">Instagram</h2>
        </div>
        <span className="t-mono studio-count">{draftCount} / 2 DRAFTS</span>
      </div>
      {notice}
      <StudioTabs
        label="Instagram format"
        value={tab}
        onChange={onTab}
        tabId={tabId}
        panelId={panelId}
        tabs={[
          { id: "reel", label: "Reel script" },
          { id: "caption", label: "Caption" },
          ...(carousel === undefined ? [] : [{ id: "carousel" as const, label: "Carousel" }]),
        ]}
      />
      <div
        className="studio-ig-panel"
        role="tabpanel"
        id={panelId(tab)}
        aria-labelledby={tabId(tab)}
        tabIndex={-1}
      >
        <p className="t-meta studio-ig-hint">{TAB_HINT[tab]}</p>
        {tab === "carousel" ? carousel : <IgPanel key={tab} {...panels[tab]} />}
      </div>
      {needCount > 0 && (
        <div className="studio-colfoot">
          <span className="t-mono studio-foot-rust">{instagramFooter(needCount)}</span>
        </div>
      )}
    </section>
  );
}
