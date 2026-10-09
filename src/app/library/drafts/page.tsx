import { Suspense } from "react";
import LibrarySkeleton from "@/components/skeletons/LibrarySkeleton";
import LibraryScreen from "@/components/features/library/LibraryScreen";

export const metadata = { title: "Drafts · Library · Solo Queue" };

export default function LibraryDraftsPage() {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <LibraryScreen tab="drafts" />
    </Suspense>
  );
}
