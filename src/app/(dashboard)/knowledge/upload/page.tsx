"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { plural } from "@/lib/ui/labels";

const COL = /^[A-Z]{1,2}$/;

export default function KnowledgeUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [questionCol, setQuestionCol] = useState("A");
  const [answerCol, setAnswerCol] = useState("B");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const colsOk = COL.test(questionCol) && COL.test(answerCol);

  // Rows are imported in the background (each one is classified by the
  // local model), so follow the source until it is done.
  async function waitForImport(sourceId: string) {
    setProgress("Importing…");
    for (;;) {
      await new Promise((r) => setTimeout(r, 2500));
      const res = await fetch(`/api/sources/${sourceId}`).catch(() => null);
      if (!res?.ok) break;
      const s = await res.json();
      const n: number = s.entriesCreated || s._count?.knowledgeEntries || 0;
      if (s.status === "completed") {
        toast.success(`${plural(n, "entry", "entries")} imported from ${s.name}`);
        return;
      }
      if (s.status === "failed") {
        toast.error(s.errorMessage ? `Import failed: ${s.errorMessage}` : "Import failed");
        return;
      }
      setProgress(`Importing… ${plural(n, "entry", "entries")} so far`);
    }
    toast.success("Source uploaded. Entries are being imported.");
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !colsOk) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sourceType", "QUESTIONNAIRE");
    formData.append("columnMapping", JSON.stringify({ questionCol, answerCol }));

    try {
      const res = await fetch("/api/sources", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      await waitForImport(data.id);
      router.push("/knowledge");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        eyebrow={
          <>
            <Link href="/knowledge" className="hover:text-accent">
              Knowledge base
            </Link>{" "}
            / Upload
          </>
        }
        title="Upload a source"
        sub="A completed questionnaire (Excel or CSV) with one question and its answer per row. Each row becomes a knowledge-base entry."
      />

      <form className="card grid gap-5 p-5" onSubmit={handleUpload}>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">File</span>
          <input
            type="file"
            className="input"
            accept=".xlsx,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
          <span className="text-xs text-ink-65">
            {file ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB` : ".xlsx or .csv, up to 10 MB"}
          </span>
        </label>

        <fieldset className="grid gap-3">
          <legend className="mb-1.5 text-[13px] font-semibold">Columns</legend>
          <div className="grid grid-cols-2 gap-4">
            <label className="grid gap-1.5">
              <span className="text-xs text-ink-65">Question column</span>
              <input className="input font-mono" value={questionCol} maxLength={2} onChange={(e) => setQuestionCol(e.target.value.toUpperCase())} placeholder="A" />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs text-ink-65">Answer column</span>
              <input className="input font-mono" value={answerCol} maxLength={2} onChange={(e) => setAnswerCol(e.target.value.toUpperCase())} placeholder="B" />
            </label>
          </div>
          {!colsOk && <p className="text-xs text-red">Use column letters, for example A and B.</p>}
        </fieldset>

        <button type="submit" className="btn btn-primary" disabled={!file || !colsOk || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          {progress ?? "Upload and import"}
        </button>
        {progress && (
          <p className="text-xs text-ink-65" role="status">
            Each row is classified by the local model, so this takes a few seconds per row.
          </p>
        )}
      </form>
    </div>
  );
}
