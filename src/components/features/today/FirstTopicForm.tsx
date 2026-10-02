"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import FormField from "@/components/ui/FormField";
import { ArrowRightIcon } from "@/components/ui/icons";
import { errorText } from "@/lib/errors";
import { topicFromInput } from "@/lib/today";
import { api } from "../../../../convex/_generated/api";

/** Step 2 of first run: one input on the card; saving creates the topic and opens it in Studio. */
export default function FirstTopicForm() {
  const create = useMutation(api.topics.create);
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const topic = topicFromInput(text);
    if (!topic) {
      setError("Give it a title, even a rough one.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await create(topic);
      router.push(`/studio/${id}`);
    } catch (err) {
      setError(errorText(err, "Could not save the topic. Try again."));
      setBusy(false);
    }
  }

  return (
    <form className="sq-t-topicform" onSubmit={submit} noValidate>
      <div className="sq-paper sq-t-note sq-t-note-form">
        <span className="sq-t-tape" aria-hidden="true" />
        <b className="sq-t-note-title">Add your first topic</b>
        <FormField label="Paste a link or a half-thought" error={error}>
          <input
            type="text"
            value={text}
            placeholder="Why I stopped paying per post"
            autoComplete="off"
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
          />
        </FormField>
      </div>
      <button type="submit" className="sq-btn sq-btn-dark" disabled={busy} aria-live="polite">
        {busy ? "Saving…" : "Save and draft both"}
        <ArrowRightIcon />
      </button>
    </form>
  );
}
