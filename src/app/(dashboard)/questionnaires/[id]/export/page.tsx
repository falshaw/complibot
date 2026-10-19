"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Download,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface ExportPreview {
  name: string;
  totalQuestions: number;
  approvedCount: number;
  answeredCount: number;
  avgConfidence: number;
  domainBreakdown: { domain: string; count: number; approved: number }[];
}

export default function ExportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    fetch(`/api/questionnaires/${id}`)
      .then((r) => r.json())
      .then((data) => {
        const domains: Record<string, { count: number; approved: number }> = {};
        let totalConfidence = 0;
        let answered = 0;

        for (const q of data.questions || []) {
          const d = q.domain;
          if (!domains[d]) domains[d] = { count: 0, approved: 0 };
          domains[d].count++;
          if (q.answers?.[0]) {
            answered++;
            totalConfidence += q.answers[0].confidence;
            if (q.answers[0].status === "APPROVED") domains[d].approved++;
          }
        }

        setPreview({
          name: data.name,
          totalQuestions: data.totalQuestions,
          approvedCount: data.approvedCount,
          answeredCount: answered,
          avgConfidence: answered > 0 ? totalConfidence / answered : 0,
          domainBreakdown: Object.entries(domains).map(([domain, stats]) => ({
            domain,
            count: stats.count,
            approved: stats.approved,
          })),
        });
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/questionnaires/${id}/export`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${preview?.name || "export"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (loading)
    return <div className="text-slate-400 text-center py-12">Loading...</div>;
  if (!preview)
    return (
      <div className="text-red-400 text-center py-12">
        Questionnaire not found
      </div>
    );

  const allApproved = preview.approvedCount === preview.totalQuestions;
  const approvalPct =
    preview.totalQuestions > 0
      ? Math.round((preview.approvedCount / preview.totalQuestions) * 100)
      : 0;

  return (
    <div className="max-w-3xl">
      <Link
        href={`/questionnaires/${id}`}
        className="text-sm text-slate-400 hover:text-white flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Review
      </Link>

      <h1 className="text-2xl font-bold text-white mb-6">
        Export: {preview.name}
      </h1>

      {/* Readiness check */}
      <div className="card-panel mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Export Readiness
        </h2>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {preview.answeredCount === preview.totalQuestions ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            )}
            <span className="text-sm text-slate-300">
              {preview.answeredCount}/{preview.totalQuestions} questions
              answered
            </span>
          </div>
          <div className="flex items-center gap-2">
            {allApproved ? (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400" />
            )}
            <span className="text-sm text-slate-300">
              {preview.approvedCount}/{preview.totalQuestions} answers approved
              ({approvalPct}%)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span className="text-sm text-slate-300">
              Average confidence: {Math.round(preview.avgConfidence * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Domain breakdown */}
      <div className="card-panel mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Domain Breakdown
        </h2>
        <div className="space-y-2">
          {preview.domainBreakdown.map((d) => (
            <div
              key={d.domain}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-slate-300">
                {d.domain.replace(/_/g, " ")}
              </span>
              <span className="text-slate-400">
                {d.approved}/{d.count} approved
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Export button */}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2"
      >
        {exporting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Download className="w-5 h-5" />
        )}
        Export to Excel
      </button>

      {!allApproved && (
        <p className="text-xs text-amber-400 text-center mt-2">
          Some answers are not yet approved. They will still be included in the
          export.
        </p>
      )}
    </div>
  );
}
