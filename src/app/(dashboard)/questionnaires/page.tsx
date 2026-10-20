"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { FileText, Table2, Upload } from "lucide-react";
import { toast } from "sonner";
import { DeleteQuestionnaireButton } from "@/components/DeleteQuestionnaireButton";
import { EmptyState, LoadingBlocks, PageHeader } from "@/components/ui/PageHeader";
import { pct, questionnaireStatus } from "@/lib/ui/labels";

interface Questionnaire {
  id: string;
  name: string;
  fileName: string | null;
  status: string;
  totalQuestions: number;
  answeredCount: number;
  approvedCount: number;
  createdAt: string;
  metadata: { framework?: string; templateName?: string } | null;
}

export default function QuestionnairesPage() {
  const [items, setItems] = useState<Questionnaire[] | null>(null);
  const role = useSession().data?.user?.role;
  const canDelete = role === "ADMIN" || role === "RESPONDER";

  useEffect(() => {
    fetch("/api/questionnaires?limit=100")
      .then((r) => (r.ok ? r.json() : { questionnaires: [] }))
      .then((data) => setItems(data.questionnaires || []))
      .catch(() => setItems([]));
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Questionnaires"
        title="Questionnaires"
        sub="Uploaded files and assessments started from a template."
        actions={
          <>
            <Link href="/questionnaires/upload" className="btn btn-primary btn-sm">
              <Upload className="h-3.5 w-3.5" aria-hidden /> Upload
            </Link>
            <Link href="/templates" className="btn btn-ghost btn-sm">
              <Table2 className="h-3.5 w-3.5" aria-hidden /> From a template
            </Link>
          </>
        }
      />

      {items === null ? (
        <LoadingBlocks />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No questionnaires yet"
          text="Upload a vendor questionnaire (CSV or Excel), or start an assessment from one of the built-in templates."
        >
          <Link href="/questionnaires/upload" className="btn btn-primary btn-sm">
            Upload questionnaire
          </Link>
          <Link href="/templates" className="btn btn-ghost btn-sm">
            Browse templates
          </Link>
        </EmptyState>
      ) : (
        <div className="card overflow-x-auto">
          <table className="data-table max-sm:[&_td]:px-3 max-sm:[&_th]:px-3">
            <thead>
              <tr>
                <th>Questionnaire</th>
                <th className="hidden md:table-cell">Source</th>
                <th className="hidden sm:table-cell">Answered</th>
                <th className="hidden sm:table-cell">Approved</th>
                <th>Status</th>
                {canDelete && (
                  <th className="w-10">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((q) => {
                const s = questionnaireStatus(q.status);
                const p = pct(q.approvedCount, q.totalQuestions);
                return (
                  <tr key={q.id}>
                    <td>
                      <Link href={`/questionnaires/${q.id}`} className="block max-w-[130px] truncate font-semibold hover:text-accent sm:max-w-[280px]">
                        {q.name}
                      </Link>
                      <div className="text-xs text-ink-45">
                        {new Date(q.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    </td>
                    <td className="hidden max-w-[200px] truncate font-mono text-xs text-ink-65 md:table-cell">
                      {q.metadata?.framework ?? q.fileName ?? "—"}
                    </td>
                    <td className="hidden font-mono text-xs sm:table-cell">
                      {q.answeredCount}/{q.totalQuestions}
                    </td>
                    <td className="hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <span className="track w-[90px]">
                          <span style={{ width: `${p}%`, background: "var(--teal)" }} />
                        </span>
                        <span className="font-mono text-xs">{q.approvedCount}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`pill ${s.tone}`}>{s.label}</span>
                    </td>
                    {canDelete && (
                      <td className="text-right">
                        <DeleteQuestionnaireButton
                          questionnaire={q}
                          variant="icon"
                          onDeleted={() => {
                            toast.success(`Deleted ${q.name}`);
                            setItems((list) => list?.filter((x) => x.id !== q.id) ?? null);
                          }}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
