import TopicCaptureForm from "@/components/features/TopicCaptureForm";
import TopicList from "@/components/features/TopicList";

export default function ResearchPage() {
  return (
    <>
      <span className="sq-tag">Research inbox</span>
      <h1 className="sq-headline">
        Four topics, <em>ripe</em> for posting.
      </h1>
      <p className="sq-sub">
        Links, quotes, and half-thoughts land here. When a topic has enough
        behind it, it goes to Studio.
      </p>

      <section className="sq-card" aria-label="Capture a topic">
        <div className="sq-card-h">
          <h2 className="sq-card-title">New topic</h2>
        </div>
        <TopicCaptureForm />
      </section>

      <TopicList />
    </>
  );
}
