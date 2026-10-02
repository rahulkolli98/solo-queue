import type { Asset } from "@/lib/studioModel";

/** A small preview: the image itself, or a hatched tile for video. */
export default function MediaThumb({ asset }: { asset: Pick<Asset, "mimeType" | "publicUrl" | "filename"> }) {
  if (asset.mimeType.startsWith("image/")) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- user media at arbitrary public URLs
      <img className="studio-thumb" src={asset.publicUrl} alt={asset.filename ?? "Attached image"} />
    );
  }
  return (
    <span className="studio-thumb studio-thumb-video t-meta" role="img" aria-label={asset.filename ?? "Attached video"}>
      VIDEO
    </span>
  );
}
