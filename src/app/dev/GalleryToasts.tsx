"use client";

import { useToast } from "@/components/ui/Toast";

/** Buttons that fire each toast variant (dev gallery only). */
export default function GalleryToasts() {
  const { toast } = useToast();
  return (
    <div className="sq-row">
      <button
        className="sq-btn sq-btn-sm"
        onClick={() =>
          toast({
            title: "Week queued: 4 Threads, 3 Instagram",
            detail: "1 skipped · the carousel still needs media. It's waiting in Drafts.",
            actions: [
              { label: "View queue", href: "/queue", variant: "primary" },
              { label: "Attach media" },
            ],
          })
        }
      >
        Success with two actions
      </button>
      <button
        className="sq-btn sq-btn-sm"
        onClick={() =>
          toast({
            title: "Couldn't save the draft",
            detail: "The change is still on screen. Try again.",
            tone: "bad",
          })
        }
      >
        Failure
      </button>
      <button className="sq-btn sq-btn-sm" onClick={() => toast({ title: "Copied." })}>
        Terse
      </button>
    </div>
  );
}
