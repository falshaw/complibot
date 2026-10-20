"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";

const COL = /^[A-Z]{1,2}$/;

export default function KnowledgeUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [questionCol, setQuestionCol] = useState("A");
  const [answerCol, setAnswerCol] = useState("B");
  const [loading, setLoading] = useState(false);

  const colsOk = COL.test(questionCol) && COL.test(answerCol);

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
      toast.success("Source uploaded. Entries are being imported.");
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
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
          <span className="text-xs text-ink-65">
            {file ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB` : ".xlsx, .xls or .csv, up to 10 MB"}
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
          Upload and import
        </button>
      </form>
    </div>
  );
}
