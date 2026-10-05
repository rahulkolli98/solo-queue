import LibraryMediaThumb from "@/components/features/library/MediaThumb";
import type { Asset } from "@/lib/studioModel";

/** A small preview: the image, or the first video frame with a play badge; "Can't load preview" if it fails. */
export default function MediaThumb({
  asset,
  name,
  broken,
}: {
  asset: Pick<Asset, "mimeType" | "publicUrl" | "filename">;
  /** Display name; falls back to the file name. */
  name?: string;
  broken?: boolean;
}) {
  const label = name ?? asset.filename ?? (asset.mimeType.startsWith("video/") ? "video" : "image");
  return <LibraryMediaThumb asset={asset} name={label} size="small" broken={broken} />;
}
