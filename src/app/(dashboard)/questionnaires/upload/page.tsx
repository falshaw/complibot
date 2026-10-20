"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function QuestionnaireUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [questionCol, setQuestionCol] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleUpload() {
    if (!file || !name) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name);
    // Empty = let the server detect the question column.
    if (questionCol.trim()) {
      formData.append("columnMapping", JSON.stringify({ questionCol }));
    }

    try {
      const res = await fetch("/api/questionnaires", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      toast.success("Questionnaire uploaded");
      router.push(`/questionnaires/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">
        Upload Questionnaire
      </h1>

      <div className="card-panel space-y-6">
        <div>
          <label className="block text-sm text-slate-400 mb-1">
            Questionnaire Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white text-sm"
            placeholder="e.g. Acme Corp Q1 2026 Security Assessment"
          />
        </div>

        <div
          className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-500/50 transition-colors"
          onClick={() => document.getElementById("q-file-input")?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) {
              setFile(f);
              if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
            }
          }}
        >
          <input
            id="q-file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              if (f && !name) setName(f.name.replace(/\.[^.]+$/, ""));
            }}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="w-8 h-8 text-indigo-400" />
              <div className="text-left">
                <p className="text-white font-medium">{file.name}</p>
                <p className="text-sm text-slate-400">
                  {(file.size / 1024).toFixed(0)} KB
                </p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
              <p className="text-white mb-1">
                Drop a questionnaire file or click to browse
              </p>
              <p className="text-sm text-slate-400">Excel (.xlsx) or CSV</p>
            </>
          )}
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">
            Question Column
          </label>
          <input
            type="text"
            value={questionCol}
            onChange={(e) => setQuestionCol(e.target.value.toUpperCase())}
            maxLength={2}
            className="w-24 px-3 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white text-sm"
            placeholder="auto"
          />
          <p className="text-xs text-slate-500 mt-1">
            Column letter with the questions. Leave empty to detect it from a
            &quot;Question&quot; header or the content.
          </p>
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || !name || loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          Upload Questionnaire
        </button>
      </div>
    </div>
  );
}
