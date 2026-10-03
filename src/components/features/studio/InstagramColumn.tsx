"use client";

import IgPanel, { type IgPanelProps } from "@/components/features/studio/IgPanel";
import { InstagramAvatar } from "@/components/features/studio/glyphs";
import StudioTabs, { useTabIds } from "@/components/features/studio/StudioTabs";

export type IgTab = "reel" | "caption";

/** Board 02 / 07c-07e: the cream Instagram column with its Reel script / Caption tabs. */
export default function InstagramColumn({
  tab,
  onTab,
  panels,
  draftCount,
}: {
  tab: IgTab;
  onTab: (tab: IgTab) => void;
  /** Props for each tab's panel. */
  panels: Record<IgTab, IgPanelProps>;
  draftCount: number;
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
      <StudioTabs
        label="Instagram format"
        value={tab}
        onChange={onTab}
        tabId={tabId}
        panelId={panelId}
        tabs={[
          { id: "reel", label: "Reel script" },
          { id: "caption", label: "Caption" },
        ]}
      />
      <div
        className="studio-ig-panel"
        role="tabpanel"
        id={panelId(tab)}
        aria-labelledby={tabId(tab)}
        tabIndex={-1}
      >
        <IgPanel key={tab} {...panels[tab]} />
      </div>
    </section>
  );
}
