import StudioHome from "@/components/features/studio/StudioHome";
import { parseFillSlot } from "@/lib/studioHandoff";

/** `?fillDay=..` comes from an open slot on the Queue board: Studio says what it is filling. */
export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <StudioHome slot={parseFillSlot(await searchParams)} />;
}
