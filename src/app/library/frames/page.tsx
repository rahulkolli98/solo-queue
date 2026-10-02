import { Suspense } from "react";
import LibrarySkeleton from "@/components/skeletons/LibrarySkeleton";
import LibraryScreen from "@/components/features/library/LibraryScreen";

export const metadata = { title: "Story frames · Library · Solo Queue" };

export default function LibraryFramesPage() {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <LibraryScreen tab="frames" />
    </Suspense>
  );
}
