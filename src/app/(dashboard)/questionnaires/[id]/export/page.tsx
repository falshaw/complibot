"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingBlocks, PageHeader } from "@/components/ui/PageHeader";
import { domainLabel, pct } from "@/lib/ui/labels";

interface Preview {
  name: string;
  fileName: string | null;
  totalQuestions: number;
  approvedCount: number;
  answeredCount: number;
  avgConfidence: number;
  domains: { domain: string; count: number; approved: number }[];
}

interface ApiQuestion {
  domain: string;
  answers?: { confidence: number; status: string }[];
}

const FORMATS = [
  { id: "filled", label: "Fill the uploaded file", hint: "Your customer's own file, with the answers in its response column" },
  { id: "xlsx", label: "Excel workbook", hint: "Question, answer, status, confidence and sources per row (.xlsx)" },
  { id: "txt", label: "Text report", hint: "Readable report grouped by question, with cited sources (.txt)" },
] as const;

function fileNameFrom(res: Response, fallback: string) {
  const cd = res.headers.get("Content-Disposition") ?? "";
  return /filename="([^"]+)"/.exec(cd)?.[1] ?? fallback;
}

export default function ExportPage() {
  const { id } = useParams<{ id: string }>();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [missing, setMissing] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/questionnaires/${id}`).then(async (r) => {
      if (!r.ok) return setMissing(true);
      const data = await r.json();
      const domains: Record<string, { count: number; approved: number }> = {};
      let conf = 0;
      let answered = 0;
      for (const q of (data.questions || []) as ApiQuestion[]) {
        const d = (domains[q.domain] ??= { count: 0, approved: 0 });
        d.count++;
        const a = q.answers?.[0];
        if (a) {
          answered++;
          conf += a.confidence;
          if (a.status === "APPROVED") d.approved++;
        }
      }
      setPreview({
        name: data.name,
        fileName: data.fileName ?? null,
        totalQuestions: data.totalQuestions,
        approvedCount: data.approvedCount,
        answeredCount: answered,
        avgConfidence: answered ? conf / answered : 0,
        domains: Object.entries(domains)
          .map(([domain, s]) => ({ domain, ...s }))
          .sort((a, b) => b.count - a.count),
      });
    });
  }, [id]);

  async function download(format: string) {
    setExporting(format);
    try {
      const res = await fetch(`/api/questionnaires/${id}/export?format=${format}`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameFrom(res, `${preview?.name || "export"}.${format}`);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Export downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  if (missing) {
    return (
      <EmptyState title="Questionnaire not found">
        <Link href="/questionnaires" className="btn btn-primary btn-sm">
          All questionnaires
        </Link>
      </EmptyState>
    );
  }
  if (!preview) return <LoadingBlocks rows={2} />;

  const allAnswered = preview.answeredCount === preview.totalQuestions;
  const allApproved = preview.approvedCount === preview.totalQuestions;
  const check = (ok: boolean) =>
    ok ? (
      <CheckCircle2 className="h-4 w-4 shrink-0 text-teal" aria-label="done" />
    ) : (
      <CircleAlert className="h-4 w-4 shrink-0 text-amber" aria-label="incomplete" />
    );

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow={
          <>
            <Link href="/questionnaires" className="hover:text-accent">
              Questionnaires
            </Link>{" "}
            / <Link href={`/questionnaires/${id}`} className="hover:text-accent">{preview.name}</Link>
          </>
        }
        title="Export"
        actions={
          <Link href={`/questionnaires/${id}`} className="btn btn-ghost btn-sm">
            Back to review
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3">Readiness</h2>
          <ul className="grid gap-2.5 text-[13px]">
            <li className="flex items-center gap-2">
              {check(allAnswered)} {preview.answeredCount}/{preview.totalQuestions} questions answered
            </li>
            <li className="flex items-center gap-2">
              {check(allApproved)} {preview.approvedCount}/{preview.totalQuestions} answers approved (
              {pct(preview.approvedCount, preview.totalQuestions)}%)
            </li>
            <li className="flex items-center gap-2 text-ink-65">
              Average confidence <b className="font-mono text-ink">{preview.avgConfidence.toFixed(2)}</b>
            </li>
          </ul>
          {!allApproved && (
            <p className="alert alert-warn mt-4">
              Only approved answers are exported. Questions without an approved answer stay empty in the
              file; the workbook and the report name their status.
            </p>
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-3">By domain</h2>
          <ul className="grid gap-2 text-[13px]">
            {preview.domains.map((d) => (
              <li key={d.domain} className="flex items-center justify-between gap-3">
                <span className="truncate">{domainLabel(d.domain)}</span>
                <span className="font-mono text-xs text-ink-65">
                  {d.approved}/{d.count} approved
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card mt-4 p-5">
        <h2 className="mb-3">Download</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FORMATS.filter((f) => f.id !== "filled" || preview.fileName).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => download(f.id)}
              disabled={!!exporting}
              className="flex items-start gap-3 rounded-2xl border border-g-line bg-g-bg p-4 text-left hover:border-accent disabled:opacity-60"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                {exporting === f.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
              </span>
              <span>
                <b className="block">{f.label}</b>
                <small className="text-xs text-ink-65">{f.hint}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
