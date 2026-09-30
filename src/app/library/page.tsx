import MediaPicker from "@/components/features/MediaPicker";

export default function LibraryPage() {
  return (
    <>
      <span className="sq-tag">Library</span>
      <h1 className="sq-headline">
        Everything written, <em>worth posting twice.</em>
      </h1>
      <p className="sq-sub">
        Photos and clips for your IG drafts live here. Every URL is verified
        reachable before it can queue — Instagram rejects dead media at
        publish time.
      </p>
      <MediaPicker />
    </>
  );
}
