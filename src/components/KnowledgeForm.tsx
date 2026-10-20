"use client";

import { useState } from "react";
import { SECURITY_DOMAINS, domainLabel } from "@/lib/ui/labels";

export interface KnowledgeFormValues {
  question: string;
  answer: string;
  domain: string;
  keywords: string[];
}

/** Question / answer / domain / keywords form, used to create and to edit. */
export function KnowledgeForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<KnowledgeFormValues>;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (v: KnowledgeFormValues) => void;
  onCancel?: () => void;
}) {
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [domain, setDomain] = useState(initial?.domain ?? "GENERAL");
  const [keywords, setKeywords] = useState((initial?.keywords ?? []).join(", "));

  const tooShort = question.trim().length < 5 || answer.trim().length < 5;

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (tooShort) return;
        onSubmit({
          question: question.trim(),
          answer: answer.trim(),
          domain,
          keywords: keywords
            .split(",")
            .map((k) => k.trim().toLowerCase())
            .filter(Boolean),
        });
      }}
    >
      <label className="grid gap-1.5">
        <span className="text-[13px] font-semibold">Question</span>
        <textarea className="input" rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} required minLength={5} maxLength={2000} />
      </label>
      <label className="grid gap-1.5">
        <span className="text-[13px] font-semibold">Answer</span>
        <textarea className="input" rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} required minLength={5} maxLength={10000} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">Domain</span>
          <select className="input" value={domain} onChange={(e) => setDomain(e.target.value)}>
            {SECURITY_DOMAINS.map((d) => (
              <option key={d} value={d}>
                {domainLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">Keywords</span>
          <input className="input" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="mfa, sso, okta" />
        </label>
      </div>
      <p className="text-xs text-ink-65">Question and answer need at least 5 characters each.</p>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || tooShort}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
