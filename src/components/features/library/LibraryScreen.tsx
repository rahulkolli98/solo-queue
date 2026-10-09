"use client";

import { useQuery } from "convex/react";
import { useStableQuery } from "@/lib/useStableQuery";
import { useDeferredValue, useState } from "react";
import LibrarySkeleton from "@/components/skeletons/LibrarySkeleton";
import PageHeader from "@/components/ui/PageHeader";
import { effectiveTz, libraryHeadline, type LibraryTab } from "@/lib/libraryBoard";
import { useBrowserTz } from "@/lib/useBrowserTz";
import { useHydrated } from "@/lib/useHydrated";
import { useNow } from "@/lib/useNow";
import { api } from "../../../../convex/_generated/api";
import DraftsTab from "./DraftsTab";
import FramesTab from "./FramesTab";
import LibraryTopbar from "./LibraryTopbar";
import LooksSection from "./LooksSection";
import MediaTab from "./MediaTab";
import PublishedTab from "./PublishedTab";
import type { LibraryFilters } from "./types";
import { useFrames } from "./useFrames";

/**
 * The Library chrome shared by its four routes: tab links with live counts,
 * search and filters, the editorial header, then the tab's own content.
 */
export default function LibraryScreen({ tab }: { tab: LibraryTab }) {
  const hydrated = useHydrated();
  const now = useNow();
  const browserTz = useBrowserTz();
  const settings = useQuery(api.settings.get);
  const published = useStableQuery(api.library.published, { now });
  const drafts = useQuery(api.library.drafts);
  const media = useQuery(api.media.list);
  const frames = useFrames();
  const [filters, setFilters] = useState<LibraryFilters>({ search: "", pillar: "", platform: "" });
  const deferredSearch = useDeferredValue(filters.search);

  if (!hydrated || settings === undefined) return <LibrarySkeleton />;

  const tz = effectiveTz(settings.timezone, browserTz);
  const applied: LibraryFilters = { ...filters, search: deferredSearch };
  const headline = libraryHeadline(tab, { drafts: drafts?.counts.all, frames: frames?.length });
  const common = { frames, voice: settings.voice.description, learnedFrom: settings.voice.learnedFromCount };

  return (
    <>
      <LibraryTopbar
        tab={tab}
        counts={{
          published: published?.length,
          drafts: drafts?.counts.all,
          frames: frames?.length,
          media: media?.length,
        }}
        filters={filters}
        onFilters={setFilters}
        pillars={settings.pillars}
      />
      <div className="lb-head">
        <PageHeader
          headline={
            <>
              {headline.before}
              <br />
              <em>{headline.rust}</em>
              {headline.after}
            </>
          }
          aside={headline.aside}
        />
      </div>
      {tab === "published" && <PublishedTab filters={applied} pillars={settings.pillars} tz={tz} {...common} />}
      {tab === "drafts" && <DraftsTab filters={applied} pillars={settings.pillars} tz={tz} {...common} />}
      {tab === "frames" && <FramesTab filters={applied} pillars={settings.pillars} frames={frames} voice={settings.voice} />}
      {tab === "frames" && <LooksSection />}
      {tab === "media" && <MediaTab filters={applied} tz={tz} {...common} />}
    </>
  );
}
