"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CitedEntry, type CitedSource } from "@/components/CitedEntry";
import { EmptyState, LoadingBlocks } from "@/components/ui/PageHeader";
import { answerStatus, domainLabel, typeLabel } from "@/lib/ui/labels";

interface Answer {
  id: string;
  content: string;
  editedContent: string | null;
  confidence: number;
  status: string;
  aiGenerated: boolean;
  reviewNote: string | null;
  sources: CitedSource[];
}

interface Question {
  id: string;
  rowIndex: number;
  questionText: string;
  questionType: string;
  domain: string;
  answers: Answer[];
}

interface Questionnaire {
  id: string;
  name: string;
  fileName: string | null;
  status: string;
  totalQuestions: number;
  answeredCount: number;
  approvedCount: number;
  questions: Question[];
}

const STEP_ORDER = ["UPLOADED", "PARSED", "IN_REVIEW", "EXPORTED"];

/** How far along the upload -> parse -> generate -> review -> export flow. */
function stepState(status: string) {
  const reached = (s: string) =>
    STEP_ORDER.indexOf(status === "COMPLETED" ? "IN_REVIEW" : status) >=
    STEP_ORDER.indexOf(s);
  return {
    parse: reached("PARSED"),
    generate: reached("IN_REVIEW"),
    review: reached("IN_REVIEW"),
    exported: status === "EXPORTED",
  };
}

async function errorText(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  return (data as { error?: string }).error || fallback;
}

export default function QuestionnaireReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [q, setQ] = useState<Questionnaire | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [threshold, setThreshold] = useState(0.8);
  const [index, setIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const initialPick = useRef(false);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/questionnaires/${id}`);
    if (!res.ok) {
      setNotFound(true);
      return null;
    }
    const data: Questionnaire = await res.json();
    setQ(data);
    return data;
  }, [id]);

  useEffect(() => {
    fetchData().then((data) => {
      if (!data || initialPick.current) return;
      initialPick.current = true;
      // ?q=<row> from the dashboard opens that question
      const row = Number(new URLSearchParams(window.location.search).get("q"));
      const i = row ? data.questions.findIndex((x) => x.rowIndex === row) : -1;
      if (i >= 0) setIndex(i);
    });
    fetch("/api/organizations")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.organization && setThreshold(d.organization.confidenceThreshold))
      .catch(() => {});
  }, [fetchData]);

  // While answers are being generated, refresh the list every few seconds.
  useEffect(() => {
    if (q?.status !== "GENERATING" && busy !== "generate") return;
    const t = setInterval(fetchData, 4000);
    return () => clearInterval(t);
  }, [q?.status, busy, fetchData]);

  const questions = q?.questions ?? [];
  const current = questions[index];
  const answer = current?.answers[0];

  const go = useCallback(
    (delta: number) => {
      setEditMode(false);
      setIndex((i) => Math.max(0, Math.min(i + delta, questions.length - 1)));
    },
    [questions.length],
  );

  async function act(
    name: string,
    url: string,
    init: RequestInit,
    ok: string,
    fail: string,
  ): Promise<boolean> {
    setBusy(name);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        toast.error(await errorText(res, fail));
        return false;
      }
      toast.success(ok);
      return true;
    } catch {
      toast.error(fail);
      return false;
    } finally {
      await fetchData();
      setBusy(null);
    }
  }

  async function approve() {
    if (!answer) return;
    const done = await act("approve", `/api/answers/${answer.id}/approve`, { method: "POST" }, "Answer approved", "Could not approve the answer");
    if (done) go(1);
  }

  function reject() {
    if (!answer) return;
    return act(
      "reject",
      `/api/answers/${answer.id}/reject`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      "Answer rejected",
      "Could not reject the answer",
    );
  }

  function regenerate() {
    if (!answer) return;
    return act("regenerate", `/api/answers/${answer.id}/regenerate`, { method: "POST" }, "New draft generated", "Could not regenerate the answer");
  }

  async function saveEdit() {
    if (!answer || !editContent.trim()) return;
    const done = await act(
      "edit",
      `/api/answers/${answer.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editedContent: editContent }),
      },
      "Edit saved",
      "Could not save the edit",
    );
    if (done) setEditMode(false);
  }

  async function parse() {
    setBusy("parse");
    try {
      const res = await fetch(`/api/questionnaires/${id}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) toast.success(`Parsed ${data.questionCount ?? 0} questions`);
      else toast.error(data.error || "Parsing failed");
    } catch {
      toast.error("Parsing failed");
    }
    await fetchData();
    setBusy(null);
  }

  async function generate() {
    setBusy("generate");
    try {
      const res = await fetch(`/api/questionnaires/${id}/generate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(
          `Generated ${data.generated ?? 0} answers` +
            (data.errors ? `, ${data.errors} failed` : ""),
        );
      } else toast.error(data.error || "Answer generation failed");
    } catch {
      toast.error("Answer generation failed");
    }
    await fetchData();
    setBusy(null);
  }

  async function bulkApprove() {
    const ids = questions
      .map((x) => x.answers[0])
      .filter((a): a is Answer => !!a && a.status === "PENDING")
      .map((a) => a.id);
    if (ids.length === 0) return;
    await act(
      "bulk",
      "/api/answers/bulk-approve",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerIds: ids }),
      },
      `Approved ${ids.length} pending ${ids.length === 1 ? "answer" : "answers"}`,
      "Bulk approve failed",
    );
  }

  // Keyboard shortcuts (not while typing)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (editMode || busy || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "ArrowRight" || e.key === "j") go(1);
      else if (e.key === "ArrowLeft" || e.key === "k") go(-1);
      else if (!answer) return;
      else if (e.key === "a" && answer.status !== "APPROVED") approve();
      else if (e.key === "r" && answer.status !== "REJECTED") reject();
      else if (e.key === "e") {
        setEditContent(answer.editedContent || answer.content);
        setEditMode(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (notFound) {
    return (
      <EmptyState title="Questionnaire not found" text="It may have been deleted.">
        <Link href="/questionnaires" className="btn btn-primary btn-sm">
          All questionnaires
        </Link>
      </EmptyState>
    );
  }
  if (!q) return <LoadingBlocks />;

  const steps = stepState(q.status);
  const open = questions.filter((x) => {
    const s = x.answers[0]?.status;
    return !s || s === "PENDING" || s === "FLAGGED";
  }).length;
  const pendingCount = questions.filter((x) => x.answers[0]?.status === "PENDING").length;
  const generating = q.status === "GENERATING" || busy === "generate";
  const shown = answer ? answer.editedContent || answer.content : "";
  const lowConfidence = !!answer && answer.status !== "APPROVED" && answer.confidence < threshold;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-4">
        <div className="min-w-0">
          <div className="eyebrow mb-1 truncate">
            <Link href="/questionnaires" className="hover:text-accent">
              Questionnaires
            </Link>{" "}
            / {q.name}
          </div>
          <h1 className="sm:!text-[28px]">Review answers</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {q.status === "UPLOADED" && (
            <button type="button" className="btn btn-primary btn-sm" onClick={parse} disabled={!!busy}>
              {busy === "parse" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              Parse questions
            </button>
          )}
          {(q.status === "PARSED" || q.status === "GENERATING") && (
            <button type="button" className="btn btn-primary btn-sm" onClick={generate} disabled={!!busy || q.status === "GENERATING"}>
              {generating && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {generating ? "Generating answers…" : "Generate answers"}
            </button>
          )}
          {pendingCount > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={bulkApprove} disabled={!!busy}>
              Bulk approve ({pendingCount})
            </button>
          )}
          {q.answeredCount > 0 && (
            <Link href={`/questionnaires/${id}/export`} className="btn btn-primary btn-sm">
              Export
            </Link>
          )}
        </div>
      </div>

      <ol className="steps mb-[18px] list-none p-0" aria-label="Progress">
        <li className="done">1 Upload</li>
        <li className={steps.parse ? "done" : "on"}>2 Parse</li>
        <li className={steps.generate ? "done" : steps.parse ? "on" : ""}>3 Generate</li>
        <li className={steps.exported ? "done" : steps.review ? "on" : ""}>4 Review</li>
        <li className={steps.exported ? "on" : ""}>
          {q.answeredCount > 0 ? <Link href={`/questionnaires/${id}/export`}>5 Export</Link> : "5 Export"}
        </li>
      </ol>

      {generating && (
        <div className="alert alert-warn mb-4" role="status">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          <span>
            Drafting answers with the local model: {q.answeredCount} of {q.totalQuestions} done.
            Each answer can take a minute or more.
          </span>
        </div>
      )}

      {questions.length === 0 ? (
        <EmptyState
          title={q.status === "UPLOADED" ? "Not parsed yet" : "No questions found"}
          text={
            q.status === "UPLOADED"
              ? "Parse the file to read its questions. The question column is detected automatically."
              : "The file had no question rows."
          }
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <nav className="card overflow-hidden !bg-g-bg" aria-label="Questions">
            <div className="flex justify-between border-b border-line px-4 py-3">
              <b>{questions.length} questions</b>
              <span className="text-ink-65">{open} open</span>
            </div>
            <ul className="max-h-[260px] overflow-y-auto lg:max-h-[620px]">
              {questions.map((x, i) => {
                const s = answerStatus(x.answers[0]?.status);
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditMode(false);
                        setIndex(i);
                      }}
                      aria-current={i === index ? "true" : undefined}
                      className={`flex w-full items-center justify-between gap-2.5 border-b border-line-2 px-4 py-3 text-left hover:bg-g-bg2 ${i === index ? "!bg-accent-soft" : ""}`}
                    >
                      <span className="min-w-0 truncate font-mono text-[13px]">
                        #{x.rowIndex} {x.questionText}
                      </span>
                      <span className={`badge ${s.badge}`}>{s.label.toLowerCase()}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {current && (
            <section className="card grid min-w-0 gap-4 p-5" aria-live="polite">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words !text-base">{current.questionText}</h2>
                  <div className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px] text-ink-65">
                    <span className="font-mono">row {current.rowIndex}</span>
                    <span>
                      Domain <b className="font-semibold text-ink">{domainLabel(current.domain)}</b>
                    </span>
                    <span>
                      Type <b className="font-semibold text-ink">{typeLabel(current.questionType)}</b>
                    </span>
                    {answer && (
                      <span>
                        Confidence <b className="font-mono font-semibold text-ink">{answer.confidence.toFixed(2)}</b>
                      </span>
                    )}
                  </div>
                </div>
                <span className={`badge ${answerStatus(answer?.status).badge}`}>
                  {answerStatus(answer?.status).label}
                </span>
              </div>

              {!answer ? (
                <p className="text-[13px] text-ink-65">
                  {q.status === "PARSED"
                    ? "No draft yet. Use “Generate answers” to draft every question from the knowledge base."
                    : generating
                      ? "Waiting for the model…"
                      : "No draft for this question."}
                </p>
              ) : (
                <>
                  {lowConfidence && (
                    <div className="flag-note" role="note">
                      <span aria-hidden>⚠</span>
                      <span>
                        <b>
                          Confidence {answer.confidence.toFixed(2)} is below the {threshold.toFixed(2)} threshold.
                        </b>{" "}
                        {answer.sources.length === 0
                          ? "No knowledge-base entry matched this question. Check before approving."
                          : "Check the cited entries before approving."}
                      </span>
                    </div>
                  )}

                  <div>
                    <div className="eyebrow mb-1.5">
                      {answer.editedContent ? "Edited answer" : "Drafted answer"}
                    </div>
                    {editMode ? (
                      <div className="grid gap-2">
                        <textarea
                          className="input min-h-[140px]"
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          aria-label="Answer text"
                          autoFocus
                        />
                        <div className="flex justify-end gap-2">
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditMode(false)}>
                            Cancel
                          </button>
                          <button type="button" className="btn btn-primary btn-sm" onClick={saveEdit} disabled={!!busy || !editContent.trim()}>
                            Save edit
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="answer-box">{shown}</div>
                    )}
                  </div>

                  {!editMode && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={regenerate} disabled={!!busy}>
                        {busy === "regenerate" && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                        Regenerate
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setEditContent(shown);
                          setEditMode(true);
                        }}
                        disabled={!!busy}
                      >
                        Edit
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={reject} disabled={!!busy || answer.status === "REJECTED"}>
                        Reject
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={approve} disabled={!!busy || answer.status === "APPROVED"}>
                        Approve
                      </button>
                    </div>
                  )}

                  {answer.sources.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {answer.sources.map((s, i) => (
                        <CitedEntry key={s.id} n={i + 1} source={s} maxHeight={230} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13px] text-ink-65">No knowledge-base entries cited.</p>
                  )}

                </>
              )}

              <div className="flex items-center justify-between border-t border-line-2 pt-3 text-xs text-ink-65">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous question">
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <span>
                  {index + 1} of {questions.length}
                  <span className="hidden sm:inline"> · keys ← → · A approve · R reject · E edit</span>
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(1)} disabled={index >= questions.length - 1} aria-label="Next question">
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
