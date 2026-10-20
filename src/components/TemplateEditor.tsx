"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { domainLabel, QUESTION_TYPES, SECURITY_DOMAINS, typeLabel } from "@/lib/ui/labels";

export interface EditableQuestion {
  text: string;
  type: string;
  domain: string;
  required: boolean;
}

export interface EditableTemplate {
  id: string;
  name: string;
  description: string | null;
  framework: string | null;
  questions: EditableQuestion[];
}

/**
 * Edit a custom template in a glass dialog (native <dialog>: focus is trapped,
 * Esc cancels). Saves with PATCH /api/templates/[id].
 */
export function TemplateEditor({
  template,
  onSaved,
  onClose,
}: {
  template: EditableTemplate;
  onSaved: (name: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const titleId = useId();
  const errorId = useId();
  const [name, setName] = useState(template.name);
  const [framework, setFramework] = useState(template.framework ?? "");
  const [description, setDescription] = useState(template.description ?? "");
  const [questions, setQuestions] = useState<EditableQuestion[]>(() =>
    template.questions.map((q) => ({
      text: q.text,
      type: q.type || "FREE_TEXT",
      domain: q.domain || "GENERAL",
      required: q.required ?? true,
    })),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const update = (i: number, patch: Partial<EditableQuestion>) => {
    setError("");
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  };

  function addQuestion() {
    setQuestions((qs) => [...qs, { text: "", type: "FREE_TEXT", domain: "GENERAL", required: true }]);
    // Focus the new question once it is rendered
    requestAnimationFrame(() => {
      const fields = listRef.current?.querySelectorAll("textarea");
      fields?.[fields.length - 1]?.focus();
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = questions.map((q) => ({ ...q, text: q.text.trim() }));
    if (!name.trim()) return setError("Give the template a name.");
    if (cleaned.length === 0) return setError("Add at least one question.");
    const short = cleaned.findIndex((q) => q.text.length < 5);
    if (short >= 0) return setError(`Question ${short + 1} needs at least 5 characters.`);

    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), framework: framework.trim(), description: description.trim(), questions: cleaned }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.details?.[0]?.message || data.error || "The template was not saved. Try again.");
        return;
      }
      onSaved(name.trim());
    } catch {
      setError("The template was not saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      className="confirm-dialog glass m-auto w-[calc(100%-32px)] max-w-3xl overflow-hidden p-0 text-left text-ink"
    >
      <form onSubmit={save} noValidate className="flex max-h-[calc(100dvh-34px)] flex-col">
        <div className="border-b border-line p-5">
          <h2 id={titleId} className="!text-lg">
            Edit template
          </h2>
          <p className="mt-1 text-[13px] text-ink-65">
            Assessments already started from this template keep their questions.
          </p>
        </div>

        <div className="grid gap-4 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <label className="grid gap-1.5 text-[13px] font-medium">
              Name
              <input className="input" value={name} onChange={(e) => { setName(e.target.value); setError(""); }} maxLength={200} required />
            </label>
            <label className="grid gap-1.5 text-[13px] font-medium">
              Framework
              <input className="input" value={framework} onChange={(e) => setFramework(e.target.value)} maxLength={100} placeholder="e.g. SIG Lite" />
            </label>
          </div>
          <label className="grid gap-1.5 text-[13px] font-medium">
            Description
            <textarea className="input !h-auto min-h-[64px] py-2.5" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={2} />
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="eyebrow">Questions ({questions.length})</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addQuestion}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add question
              </button>
            </div>
            <ol ref={listRef} className="grid gap-2.5">
              {questions.map((q, i) => (
                <li key={i} className="card grid gap-2.5 p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-2.5 w-6 shrink-0 font-mono text-xs text-ink-45" aria-hidden>
                      {i + 1}.
                    </span>
                    <textarea
                      className="input !h-auto min-h-[44px] flex-1 py-2.5 text-[13.5px]"
                      aria-label={`Question ${i + 1}`}
                      value={q.text}
                      rows={2}
                      maxLength={2000}
                      onChange={(e) => update(i, { text: e.target.value })}
                    />
                    <button
                      type="button"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-45 hover:bg-red-soft hover:text-red focus-visible:text-red"
                      aria-label={`Remove question ${i + 1}`}
                      title="Remove question"
                      onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                  <div className="grid gap-2 pl-8 sm:grid-cols-[160px_1fr_auto] sm:items-center">
                    <select className="input !h-9 !text-[13px]" aria-label={`Type of question ${i + 1}`} value={q.type} onChange={(e) => update(i, { type: e.target.value })}>
                      {QUESTION_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {typeLabel(t)}
                        </option>
                      ))}
                    </select>
                    <select className="input !h-9 !text-[13px]" aria-label={`Domain of question ${i + 1}`} value={q.domain} onChange={(e) => update(i, { domain: e.target.value })}>
                      {SECURITY_DOMAINS.map((d) => (
                        <option key={d} value={d}>
                          {domainLabel(d)}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-[13px] text-ink-65">
                      <input type="checkbox" checked={q.required} onChange={(e) => update(i, { required: e.target.checked })} className="h-4 w-4 accent-[var(--accent)]" />
                      Required
                    </label>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="border-t border-line p-4">
          {error && (
            <p id={errorId} className="mb-3 text-[13px] font-medium text-red" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save template
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
