import { notFound } from "next/navigation";
import Link from "next/link";
import Banner from "@/components/ui/Banner";
import GalleryToasts from "@/app/dev/GalleryToasts";

const SCREENS = ["today", "studio", "queue", "research", "library", "settings"];

/**
 * Development-only component gallery: every app-wide primitive in one place
 * (banners, pills, buttons, toasts, loading screens). 404 in production.
 */
export default function Gallery() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <>
      <span className="t-eyebrow">Dev gallery</span>
      <h1 className="sq-headline">
        Primitives, <em>one page.</em>
      </h1>

      <section className="sq-col-gallery">
        <h2 className="t-title">Banners</h2>
        <Banner
          tone="coral"
          title="Instagram post failed · Sat 26 Sep, 12:00."
          detail="Image 2 of the carousel: media URL not reachable."
          actions={[
            { label: "Replace media", variant: "secondary" },
            { label: "Reschedule", variant: "primary" },
          ]}
        />
        <Banner
          tone="yellow"
          title="Threads token expires in 6 days."
          detail="Reconnect before Thursday's slots fail."
          actions={[{ label: "Reconnect", href: "/settings", variant: "primary" }]}
        />
        <Banner
          tone="blue"
          title="Instagram has 2 days written."
          detail="Empty: Mon 28, Tue 29, Wed 30."
          actions={[
            { label: "Fill from research", href: "/studio", variant: "primary" },
            { label: "Dismiss this week", variant: "secondary" },
          ]}
        />
      </section>

      <section className="sq-col-gallery">
        <h2 className="t-title">Pills and buttons</h2>
        <div className="sq-row">
          <span className="sq-pill sq-pill-ok">PUBLISHED</span>
          <span className="sq-pill sq-pill-mid">RETRYING</span>
          <span className="sq-pill sq-pill-bad">FAILED</span>
        </div>
        <div className="sq-row">
          <button className="sq-btn">Default</button>
          <button className="sq-btn sq-btn-primary">Primary</button>
          <button className="sq-btn sq-btn-dark">Dark</button>
          <button className="sq-btn sq-btn-sm">Small</button>
        </div>
      </section>

      <section className="sq-col-gallery">
        <h2 className="t-title">Toasts</h2>
        <GalleryToasts />
      </section>

      <section className="sq-col-gallery">
        <h2 className="t-title">Loading screens</h2>
        <div className="sq-row">
          {SCREENS.map((s) => (
            <Link key={s} href={`/dev/loading/${s}`} className="sq-btn sq-btn-sm">
              {s}
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
