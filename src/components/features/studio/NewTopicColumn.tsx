"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "../../../../convex/_generated/api";
import FormField from "@/components/ui/FormField";
import { studioErrorText } from "@/lib/studioErrors";

/** Board 07c: the blue column with the new-topic form and the inbox picker. */
export default function NewTopicColumn() {
  const router = useRouter();
  const create = useMutation(api.topics.create);
  const board = useQuery(api.topics.board);
  const settings = useQuery(api.settings.get);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the topic a title.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await create({ title: title.trim(), notes: notes.trim() || undefined });
      router.push(`/studio/${id}?draft=1`);
    } catch (err) {
      setError(studioErrorText(err, "Couldn't save the topic."));
      setBusy(false);
    }
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
      <form className="studio-note studio-note-form" onSubmit={(e) => void submit(e)} aria-label="New topic" noValidate>
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
        <button type="submit" className="sq-btn sq-btn-dark" disabled={busy}>
          {busy ? "Saving…" : "Save and draft both"}
        </button>
      </form>

      <h3 className="t-eyebrow studio-inbox-title">Or draft from your inbox</h3>
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
              <Link
                href={`/studio/${topic._id}?draft=1`}
                className="sq-btn sq-btn-sm"
                aria-label={`Draft ${topic.title}`}
              >
                Draft
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
