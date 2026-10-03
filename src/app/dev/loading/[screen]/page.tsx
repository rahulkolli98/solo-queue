import { notFound } from "next/navigation";
import LibrarySkeleton from "@/components/skeletons/LibrarySkeleton";
import QueueSkeleton from "@/components/skeletons/QueueSkeleton";
import ResearchSkeleton from "@/components/skeletons/ResearchSkeleton";
import SettingsSkeleton from "@/components/skeletons/SettingsSkeleton";
import StudioSkeleton from "@/components/skeletons/StudioSkeleton";
import TodaySkeleton from "@/components/skeletons/TodaySkeleton";

const SCREENS: Record<string, () => React.JSX.Element> = {
  today: TodaySkeleton,
  studio: StudioSkeleton,
  queue: QueueSkeleton,
  research: ResearchSkeleton,
  library: LibrarySkeleton,
  settings: SettingsSkeleton,
};

/** Development-only: render one loading skeleton without needing a slow network. */
export default async function LoadingPreview({
  params,
}: {
  params: Promise<{ screen: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { screen } = await params;
  const Screen = SCREENS[screen];
  if (!Screen) notFound();
  return <Screen />;
}
