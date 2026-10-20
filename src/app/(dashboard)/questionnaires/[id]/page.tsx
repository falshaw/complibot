"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle,
  XCircle,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  Edit3,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { clsx } from "clsx";

interface Source {
  id: string;
  similarity: number;
  knowledgeEntry: {
    id: string;
    question: string;
    answer: string;
    domain: string;
  };
}

interface Answer {
  id: string;
  content: string;
  editedContent: string | null;
  confidence: number;
  status: string;
  aiGenerated: boolean;
  sources: Source[];
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
  status: string;
  totalQuestions: number;
  approvedCount: number;
  questions: Question[];
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const cls =
    confidence >= 0.8
      ? "badge-high"
      : confidence >= 0.5
        ? "badge-medium"
        : "badge-low";
  return (
    <span className={`${cls} px-2 py-0.5 rounded text-xs font-medium`}>
      {pct}%
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "APPROVED"
      ? "status-approved"
      : status === "REJECTED"
        ? "status-rejected"
        : "status-pending";
  return (
    <span className={`${cls} px-2 py-0.5 rounded text-xs font-medium`}>
      {status}
    </span>
  );
}

export default function QuestionnaireReviewPage() {
  const { id } = useParams<{ id: string }>();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | null>(
    null,
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchData = useCallback(() => {
    fetch(`/api/questionnaires/${id}`)
      .then((r) => r.json())
      .then(setQuestionnaire)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const currentQuestion = questionnaire?.questions[currentIndex];
  const currentAnswer = currentQuestion?.answers[0];

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (editMode) return;
      if (e.key === "ArrowRight" || e.key === "j")
        setCurrentIndex((i) =>
          Math.min(i + 1, (questionnaire?.questions.length || 1) - 1),
        );
      if (e.key === "ArrowLeft" || e.key === "k")
        setCurrentIndex((i) => Math.max(i - 1, 0));
      if (e.key === "a" && currentAnswer) handleApprove();
      if (e.key === "r" && currentAnswer) handleReject();
      if (e.key === "e" && currentAnswer) {
        setEditMode(true);
        setEditContent(currentAnswer.editedContent || currentAnswer.content);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  async function handleApprove() {
    if (!currentAnswer) return;
    setActionLoading(true);
    await fetch(`/api/answers/${currentAnswer.id}/approve`, { method: "POST" });
    toast.success("Answer approved");
    fetchData();
    setActionLoading(false);
    setCurrentIndex((i) =>
      Math.min(i + 1, (questionnaire?.questions.length || 1) - 1),
    );
  }

  async function handleReject() {
    if (!currentAnswer) return;
    setActionLoading(true);
    await fetch(`/api/answers/${currentAnswer.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    toast.info("Answer rejected");
    fetchData();
    setActionLoading(false);
  }

  async function handleRegenerate() {
    if (!currentAnswer) return;
    setActionLoading(true);
    await fetch(`/api/answers/${currentAnswer.id}/regenerate`, {
      method: "POST",
    });
    toast.success("Answer regenerated");
    fetchData();
    setActionLoading(false);
  }

  async function handleSaveEdit() {
    if (!currentAnswer) return;
    setActionLoading(true);
    await fetch(`/api/answers/${currentAnswer.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ editedContent: editContent }),
    });
    toast.success("Edit saved");
    setEditMode(false);
    fetchData();
    setActionLoading(false);
  }

  async function handleExport() {
    const res = await fetch(`/api/questionnaires/${id}/export`, {
      method: "POST",
    });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${questionnaire?.name || "export"}.xlsx`;
      a.click();
      toast.success("Export downloaded");
    }
  }

  async function handleGenerate() {
    setActionLoading(true);
    await fetch(`/api/questionnaires/${id}/generate`, { method: "POST" });
    toast.success("AI generation started");
    fetchData();
    setActionLoading(false);
  }

  async function handleParse() {
    setActionLoading(true);
    await fetch(`/api/questionnaires/${id}/parse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    toast.success("Parsing started");
    fetchData();
    setActionLoading(false);
  }

  if (loading)
    return <div className="text-slate-400 text-center py-12">Loading...</div>;
  if (!questionnaire)
    return (
      <div className="text-red-400 text-center py-12">
        Questionnaire not found
      </div>
    );

  const progress =
    questionnaire.totalQuestions > 0
      ? Math.round(
          (questionnaire.approvedCount / questionnaire.totalQuestions) * 100,
        )
      : 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white">{questionnaire.name}</h1>
          <p className="text-sm text-slate-400">
            {questionnaire.approvedCount}/{questionnaire.totalQuestions}{" "}
            approved ({progress}%)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {questionnaire.status === "UPLOADED" && (
            <button
              onClick={handleParse}
              disabled={actionLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-sm"
            >
              Parse Questions
            </button>
          )}
          {questionnaire.status === "PARSED" && (
            <button
              onClick={handleGenerate}
              disabled={actionLoading}
              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm"
            >
              Generate Answers
            </button>
          )}
          <button
            onClick={handleExport}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-700 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-indigo-500 rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCurrentIndex((i) => Math.max(i - 1, 0))}
          disabled={currentIndex === 0}
          className="text-slate-400 hover:text-white disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm text-slate-400">
          Question {currentIndex + 1} of {questionnaire.questions.length}
        </span>
        <button
          onClick={() =>
            setCurrentIndex((i) =>
              Math.min(i + 1, questionnaire.questions.length - 1),
            )
          }
          disabled={currentIndex >= questionnaire.questions.length - 1}
          className="text-slate-400 hover:text-white disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Side-by-side panel */}
      {currentQuestion && (
        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
          {/* Left: Question */}
          <div className="card-panel overflow-y-auto">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                #{currentQuestion.rowIndex}
              </span>
              <span className="text-xs bg-indigo-500/15 text-indigo-400 px-2 py-0.5 rounded">
                {currentQuestion.domain.replace(/_/g, " ")}
              </span>
              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded">
                {currentQuestion.questionType}
              </span>
            </div>
            <p className="text-white leading-relaxed">
              {currentQuestion.questionText}
            </p>

            {/* Sources */}
            {currentAnswer?.sources && currentAnswer.sources.length > 0 && (
              <div className="mt-6 border-t border-slate-700 pt-4">
                <h4 className="text-xs font-medium text-slate-400 uppercase mb-2 flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5" /> KB Sources
                </h4>
                <div className="space-y-2">
                  {currentAnswer.sources.map((s, i) => (
                    <div
                      key={s.id}
                      className="text-xs bg-slate-800/50 p-2 rounded border border-slate-700/50"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-400">Source {i + 1}</span>
                        <span className="text-indigo-400">
                          {Math.round(s.similarity * 100)}% match
                        </span>
                      </div>
                      <p className="text-slate-300 line-clamp-2">
                        {s.knowledgeEntry.question}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: Answer */}
          <div className="card-panel overflow-y-auto flex flex-col">
            {currentAnswer ? (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <ConfidenceBadge confidence={currentAnswer.confidence} />
                  <StatusBadge status={currentAnswer.status} />
                  {currentAnswer.aiGenerated && (
                    <span className="text-xs text-purple-400">
                      AI Generated
                    </span>
                  )}
                </div>

                {editMode ? (
                  <div className="flex-1 flex flex-col">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="flex-1 bg-[#0f172a] border border-slate-700 rounded-lg p-3 text-white text-sm resize-none focus:outline-none focus:border-indigo-500"
                    />
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={handleSaveEdit}
                        disabled={actionLoading}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditMode(false)}
                        className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1">
                    <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {currentAnswer.editedContent || currentAnswer.content}
                    </p>
                    {currentAnswer.editedContent && (
                      <p className="text-xs text-slate-500 mt-2 italic">
                        Manually edited
                      </p>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                {!editMode && (
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-700">
                    <button
                      onClick={handleApprove}
                      disabled={
                        actionLoading || currentAnswer.status === "APPROVED"
                      }
                      className={clsx(
                        "flex items-center gap-1 px-3 py-1.5 rounded text-sm font-medium transition-colors",
                        currentAnswer.status === "APPROVED"
                          ? "bg-emerald-800/30 text-emerald-400 cursor-default"
                          : "bg-emerald-600 hover:bg-emerald-700 text-white",
                      )}
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve (A)
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={actionLoading}
                      className="flex items-center gap-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 px-3 py-1.5 rounded text-sm font-medium"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject (R)
                    </button>
                    <button
                      onClick={() => {
                        setEditMode(true);
                        setEditContent(
                          currentAnswer.editedContent || currentAnswer.content,
                        );
                      }}
                      disabled={actionLoading}
                      className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-sm"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit (E)
                    </button>
                    <button
                      onClick={handleRegenerate}
                      disabled={actionLoading}
                      className="flex items-center gap-1 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 px-3 py-1.5 rounded text-sm"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-slate-500 text-center py-8">
                No answer generated yet. Click &quot;Generate Answers&quot; to
                start.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Keyboard shortcuts hint */}
      <div className="mt-3 text-xs text-slate-600 text-center">
        Shortcuts: ← → navigate | A approve | R reject | E edit
      </div>
    </div>
  );
}
