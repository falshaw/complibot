"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";

export default function QuestionnaireUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [questionCol, setQuestionCol] = useState("");
  const [loading, setLoading] = useState(false);

  const colOk = questionCol === "" || /^[A-Z]{1,2}$/.test(questionCol);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !name.trim() || !colOk) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name.trim());
    // Empty = let the server detect the question column.
    if (questionCol) formData.append("columnMapping", JSON.stringify({ questionCol }));

    try {
      const res = await fetch("/api/questionnaires", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Upload failed");
      toast.success("Questionnaire uploaded");
      router.push(`/questionnaires/${data.id}`);
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
            <Link href="/questionnaires" className="hover:text-accent">
              Questionnaires
            </Link>{" "}
            / Upload
          </>
        }
        title="Upload a questionnaire"
        sub="Excel or CSV with one question per row. You parse it on the next screen, then generate the answers."
      />

      <form className="card grid gap-5 p-5" onSubmit={handleUpload}>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">File</span>
          <input
            type="file"
            className="input"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f && !name) setName(f.name.replace(/\.[^.]+$/, ""));
            }}
            required
          />
          <span className="text-xs text-ink-65">
            {file ? `${file.name} · ${Math.max(1, Math.round(file.size / 1024))} KB` : ".xlsx, .xls or .csv, up to 10 MB"}
          </span>
        </label>

        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northwind vendor assessment 2026" required maxLength={200} />
        </label>

        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">Question column</span>
          <input className="input w-28 font-mono" value={questionCol} maxLength={2} onChange={(e) => setQuestionCol(e.target.value.toUpperCase())} placeholder="auto" />
          <span className={`text-xs ${colOk ? "text-ink-65" : "text-red"}`}>
            {colOk
              ? "Leave empty to detect it from a “Question” header or the content."
              : "Use a column letter, for example B."}
          </span>
        </label>

        <button type="submit" className="btn btn-primary" disabled={!file || !name.trim() || !colOk || loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
          Upload questionnaire
        </button>
      </form>
    </div>
  );
}
