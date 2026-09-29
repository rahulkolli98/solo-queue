export default function TodayPage() {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <>
      <span className="sq-tag">Today</span>
      <p className="sq-sub">{today}</p>
      <h1 className="sq-headline">
        Today, <em>handled.</em>
      </h1>
      <p className="sq-sub">
        Coverage per platform, today&apos;s slots, and anything needing
        attention will live here.
      </p>
    </>
  );
}
