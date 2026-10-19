"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function KnowledgeUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [questionCol, setQuestionCol] = useState("A");
  const [answerCol, setAnswerCol] = useState("B");
  const [loading, setLoading] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("sourceType", "QUESTIONNAIRE");
    formData.append(
      "columnMapping",
      JSON.stringify({
        questionCol,
        answerCol,
      }),
    );

    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Source uploaded and processing started");
      router.push("/knowledge");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">
        Upload to Knowledge Base
      </h1>

      <div className="card-panel space-y-6">
        {/* File drop zone */}
        <div
          className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-500/50 transition-colors"
          onClick={() => document.getElementById("file-input")?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) setFile(f);
          }}
        >
          <input
            id="file-input"
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
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
                Drop a file here or click to browse
              </p>
              <p className="text-sm text-slate-400">
                Excel (.xlsx) or CSV with Q&A pairs
              </p>
            </>
          )}
        </div>

        {/* Column mapping */}
        <div>
          <h3 className="text-white font-medium mb-3">Column Mapping</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Question Column
              </label>
              <input
                type="text"
                value={questionCol}
                onChange={(e) => setQuestionCol(e.target.value.toUpperCase())}
                maxLength={2}
                className="w-full px-3 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white text-sm"
                placeholder="A"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Answer Column
              </label>
              <input
                type="text"
                value={answerCol}
                onChange={(e) => setAnswerCol(e.target.value.toUpperCase())}
                maxLength={2}
                className="w-full px-3 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white text-sm"
                placeholder="B"
              />
            </div>
          </div>
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          Upload & Process
        </button>
      </div>
    </div>
  );
}
