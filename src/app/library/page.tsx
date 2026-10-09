import { Suspense } from "react";
import LibrarySkeleton from "@/components/skeletons/LibrarySkeleton";
import LibraryScreen from "@/components/features/library/LibraryScreen";

export const metadata = { title: "Library · Solo Queue" };

export default function LibraryPublishedPage() {
  return (
    <Suspense fallback={<LibrarySkeleton />}>
      <LibraryScreen tab="published" />
    </Suspense>
  );
}
