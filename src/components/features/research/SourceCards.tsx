"use client";

import { useMutation } from "convex/react";
import ClampedText from "@/components/ui/ClampedText";
import { CloseIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { hostOf, linkTitle } from "@/lib/researchBoard";
import { refusalText } from "@/lib/refusalText";
import { useTwoTap } from "@/lib/useTwoTap";
import { api } from "../../../../convex/_generated/api";
import type { Source } from "./types";

function RemoveButton({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { armed, tap } = useTwoTap();
  return (
    <button
      type="button"
      className="rs-src-x"
      data-armed={armed || undefined}
      aria-label={armed ? `Tap again to remove ${label}` : `Remove ${label}`}
      onClick={() => tap(onRemove)}
    >
      {armed ? "TAP AGAIN" : <CloseIcon />}
    </button>
  );
}

/** One clipping on the board: a tilted link card, quote, note or screenshot. */
function SourceCard({ source, imageUrl }: { source: Source; imageUrl: string | undefined }) {
  const remove = useMutation(api.sources.remove);
  const { toast } = useToast();

  async function onRemove() {
    try {
      await remove({ id: source._id });
    } catch (err) {
      toast({ title: "Could not remove that source", detail: refusalText(err, "Try again."), tone: "bad" });
    }
  }
  const x = <RemoveButton label={source.label} onRemove={() => void onRemove()} />;

  if (source.kind === "link") {
    return (
      <div className="rs-src rs-link">
        <ClampedText text={source.text ?? (source.url ? linkTitle(source.url) : source.label)}>
          {(shown) => (
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              <span className="t-meta">
                LINK · {source.url ? hostOf(source.url).toUpperCase() : source.label.toUpperCase()}
              </span>
              <b>{shown}</b>
            </a>
          )}
        </ClampedText>
        {x}
      </div>
    );
  }
  if (source.kind === "quote") {
    return (
      <div className="rs-src rs-note rs-note-quote">
        <span className="rs-tape rs-tape-cream" aria-hidden="true" />
        <span className="t-meta">QUOTE · {source.label.toUpperCase()}</span>
        <ClampedText text={source.text ?? ""}>
          {(shown) => <span className="rs-note-text">&ldquo;{shown}&rdquo;</span>}
        </ClampedText>
        {x}
      </div>
    );
  }
  if (source.kind === "screenshot") {
    return (
      <div className="rs-src rs-shot">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={source.label} />
        ) : (
          <span className="t-meta rs-shot-label">[SCREENSHOT · {source.label.toUpperCase()}]</span>
        )}
        {x}
      </div>
    );
  }
  return (
    <div className="rs-src rs-note rs-note-own">
      <span className="t-meta">{source.label.toUpperCase()}</span>
      <ClampedText text={source.text ?? ""}>
        {(shown) => <span className="rs-note-text">{shown}</span>}
      </ClampedText>
      {x}
    </div>
  );
}

/** The column of clippings beside the brief. */
export default function SourceCards({
  sources,
  imageUrls,
}: {
  sources: Source[];
  imageUrls: Map<string, string>;
}) {
  return (
    <>
      {sources.map((s) => (
        <SourceCard
          key={s._id}
          source={s}
          imageUrl={s.mediaAssetId ? imageUrls.get(s.mediaAssetId) : undefined}
        />
      ))}
    </>
  );
}
