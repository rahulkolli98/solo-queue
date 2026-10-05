"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../../../convex/_generated/api";
import FormField from "@/components/ui/FormField";
import { studioErrorText } from "@/lib/studioErrors";

/** Board 07c: the blue column with the new-topic form and the inbox picker. */
export default function NewTopicColumn({ emphasiseInbox = false }: { emphasiseInbox?: boolean }) {
  const router = useRouter();
  const create = useMutation(api.topics.create);
  const board = useQuery(api.topics.board);
  const settings = useQuery(api.settings.get);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "write" | null>(null);
  const inboxRef = useRef<HTMLDivElement>(null);

  // Arrived from an open slot: bring the inbox into view (it sits below the form on small screens).
  useEffect(() => {
    if (emphasiseInbox) inboxRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [emphasiseInbox]);

  /** Save the topic, then open it: the model writes the first batch, or the founder writes the thread. */
  async function save(mode: "draft" | "write") {
    if (busy) return;
    if (!title.trim()) {
      setError("Give the topic a title.");
      return;
    }
    setBusy(mode);
    setError(null);
    try {
      const id = await create({ title: title.trim(), notes: notes.trim() || undefined });
      router.push(`/studio/${id}?${mode === "write" ? "write=1" : "draft=1"}`);
    } catch (err) {
      setError(studioErrorText(err, "Couldn't save the topic."));
      setBusy(null);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void save("draft");
  }

  const inbox = (board ?? []).filter((t) => t.status === "drafting" || t.status === "ready").slice(0, 6);
  const colorOf = (pillar: string | undefined) =>
    settings?.pillars.find((p) => p.key === pillar)?.color ?? "pillar-tools";

  return (
    <section className="studio-col studio-col-topic" data-open="true" aria-label="The topic">
      <div className="studio-topic-head">
        <h2 className="t-eyebrow">The topic</h2>
        <span className="t-meta">NEW</span>
      </div>
      <form className="studio-note studio-note-form" onSubmit={submit} aria-label="New topic" noValidate>
        <span className="sq-tape" aria-hidden="true" />
        <FormField label="Title" error={error}>
          <input
            type="text"
            autoFocus
            value={title}
            maxLength={200}
            placeholder="What's the post about?"
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
          />
        </FormField>
        <FormField label="Notes">
          <textarea
            rows={3}
            value={notes}
            maxLength={2000}
            placeholder="A link, a quote, or the point you want to make"
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
        <div className="studio-form-actions">
          <button type="submit" className="sq-btn sq-btn-dark" disabled={busy !== null}>
            {busy === "draft" ? "Saving…" : "Save and draft both"}
          </button>
          <button type="button" className="sq-btn studio-secondary" disabled={busy !== null} onClick={() => void save("write")}>
            {busy === "write" ? "Saving…" : "Save and write it myself"}
          </button>
        </div>
      </form>

      <div className="studio-inbox-box" data-emphasis={emphasiseInbox || undefined} ref={inboxRef}>
        <h3 className="t-eyebrow studio-inbox-title">
          {emphasiseInbox ? "Pick a topic from your inbox" : "Or draft from your inbox"}
        </h3>
        {emphasiseInbox && (
          <p className="studio-inbox-lead">
            Press Draft next to a topic and it is written for both platforms, or press Write to write the thread yourself.
          </p>
        )}
        {board === undefined ? (
          <p className="t-meta" role="status">
            LOADING YOUR INBOX…
          </p>
        ) : inbox.length === 0 ? (
          <p className="studio-inbox-empty">
            Nothing waiting. <Link href="/research">Capture a topic in Research</Link> and it shows up here.
          </p>
        ) : (
          <ul className="studio-inbox">
            {inbox.map((topic) => (
              <li key={topic._id} className="studio-inbox-row">
                <span
                  className="studio-swatch"
                  style={{ background: `var(--color-${colorOf(topic.pillar)})` }}
                  aria-hidden="true"
                />
                <span className="studio-inbox-name">{topic.title}</span>
                <span className="studio-inbox-actions">
                  <Link
                    href={`/studio/${topic._id}?draft=1`}
                    className="sq-btn sq-btn-sm"
                    aria-label={`Draft ${topic.title}`}
                  >
                    Draft
                  </Link>
                  <Link
                    href={`/studio/${topic._id}?write=1`}
                    className="sq-btn sq-btn-sm studio-secondary"
                    aria-label={`Write ${topic.title} yourself`}
                  >
                    Write
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
