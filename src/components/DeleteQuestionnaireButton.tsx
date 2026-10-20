"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Delete a questionnaire after a confirm dialog. The API removes its
 * questions, drafted answers, citations and export records, and writes an
 * audit entry. Knowledge-base entries are not touched.
 */
export function DeleteQuestionnaireButton({
  questionnaire,
  variant = "button",
  onDeleted,
}: {
  questionnaire: { id: string; name: string; totalQuestions: number; answeredCount: number };
  variant?: "button" | "icon";
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/questionnaires/${questionnaire.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setOpen(false);
      onDeleted();
      return;
    }
    setError(
      res?.status === 403
        ? "Only admins and responders can delete questionnaires."
        : res?.status === 404
          ? "This questionnaire no longer exists."
          : "The questionnaire was not deleted. Try again.",
    );
  }

  const q = questionnaire;
  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          className="grid h-8 w-8 place-items-center rounded-full text-ink-45 hover:bg-red-soft hover:text-red focus-visible:text-red"
          aria-label={`Delete questionnaire ${q.name}`}
          title="Delete questionnaire"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
        </button>
      )}
      <ConfirmDialog
        open={open}
        title="Delete this questionnaire?"
        confirmLabel="Delete questionnaire"
        busy={busy}
        error={error}
        onConfirm={remove}
        onCancel={() => {
          setOpen(false);
          setError("");
        }}
      >
        <p>
          <b className="text-ink">{q.name}</b> will be removed with its {q.totalQuestions}{" "}
          {q.totalQuestions === 1 ? "question" : "questions"}
          {q.answeredCount > 0 ? `, ${q.answeredCount} drafted ${q.answeredCount === 1 ? "answer" : "answers"} and their review decisions` : ""}{" "}
          and its export history. The knowledge base is not changed. This cannot be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
