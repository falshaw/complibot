"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
  Upload,
  Clock,
  CheckCircle,
  AlertCircle,
  Download,
} from "lucide-react";

interface Questionnaire {
  id: string;
  name: string;
  status: string;
  totalQuestions: number;
  answeredCount: number;
  approvedCount: number;
  createdAt: string;
}

const STATUS_ICONS: Record<string, typeof Clock> = {
  UPLOADED: Upload,
  PARSING: Clock,
  PARSED: FileText,
  GENERATING: Clock,
  IN_REVIEW: AlertCircle,
  COMPLETED: CheckCircle,
  EXPORTED: Download,
};

const STATUS_COLORS: Record<string, string> = {
  UPLOADED: "text-slate-400",
  PARSING: "text-amber-400",
  PARSED: "text-blue-400",
  GENERATING: "text-purple-400",
  IN_REVIEW: "text-amber-400",
  COMPLETED: "text-emerald-400",
  EXPORTED: "text-emerald-400",
};

export default function QuestionnairesPage() {
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/questionnaires")
      .then((r) => r.json())
      .then((data) => setQuestionnaires(data.questionnaires || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Questionnaires</h1>
        <Link
          href="/questionnaires/upload"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
        >
          <Upload className="w-4 h-4" /> Upload New
        </Link>
      </div>

      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading...</div>
      ) : questionnaires.length === 0 ? (
        <div className="card-panel text-center py-16">
          <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg text-white mb-2">No questionnaires yet</h3>
          <p className="text-slate-400 mb-4">
            Upload your first security questionnaire to get started
          </p>
          <Link
            href="/questionnaires/upload"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Upload Questionnaire
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {questionnaires.map((q) => {
            const Icon = STATUS_ICONS[q.status] || FileText;
            const color = STATUS_COLORS[q.status] || "text-slate-400";
            const progress =
              q.totalQuestions > 0
                ? Math.round((q.approvedCount / q.totalQuestions) * 100)
                : 0;

            return (
              <Link
                key={q.id}
                href={`/questionnaires/${q.id}`}
                className="card-panel flex items-center justify-between hover:border-indigo-500/30 transition-colors block"
              >
                <div className="flex items-center gap-4">
                  <Icon className={`w-6 h-6 ${color}`} />
                  <div>
                    <h3 className="text-white font-medium">{q.name}</h3>
                    <p className="text-sm text-slate-400">
                      {q.totalQuestions} questions | {q.answeredCount} answered
                      | {q.approvedCount} approved
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className={`text-sm font-medium ${color}`}>
                    {q.status.replace(/_/g, " ")}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
