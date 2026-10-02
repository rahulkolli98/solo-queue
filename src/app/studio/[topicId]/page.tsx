import Composer from "@/components/features/Composer";

export default async function TopicStudioPage({
  params,
}: {
  params: Promise<{ topicId: string }>;
}) {
  const { topicId } = await params;
  return (
    <>
      <span className="sq-tag">Studio</span>
      <h1 className="sq-headline">
        Draft it <em>once,</em> ship it twice.
      </h1>
      <p className="sq-sub">
        One topic in, both platforms out. Generate from your templates,
        check the limits live, then queue the week.
      </p>
      <Composer topicId={topicId} />
    </>
  );
}
