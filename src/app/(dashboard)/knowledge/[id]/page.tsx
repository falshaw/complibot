"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Edit3, Trash2, CheckCircle, Tag } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  domain: string;
  isVerified: boolean;
  keywords: string[];
  source: { name: string; sourceType: string } | null;
  createdAt: string;
  updatedAt: string;
}

export default function KnowledgeEntryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [entry, setEntry] = useState<KnowledgeEntry | null>(null);
  const [editing, setEditing] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/knowledge/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setEntry(data);
        setQuestion(data.question);
        setAnswer(data.answer);
        setDomain(data.domain);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    const res = await fetch(`/api/knowledge/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer, domain }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEntry(updated);
      setEditing(false);
      toast.success("Entry updated");
    } else {
      toast.error("Failed to update");
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this knowledge entry?")) return;
    const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Entry deleted");
      router.push("/knowledge");
    } else {
      toast.error("Failed to delete");
    }
  }

  if (loading)
    return <div className="text-slate-400 text-center py-12">Loading...</div>;
  if (!entry)
    return (
      <div className="text-red-400 text-center py-12">Entry not found</div>
    );

  return (
    <div className="max-w-3xl">
      <Link
        href="/knowledge"
        className="text-sm text-slate-400 hover:text-white flex items-center gap-1 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Knowledge Base
      </Link>

      <div className="card-panel">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-indigo-500/15 text-indigo-400 px-2 py-0.5 rounded">
              {entry.domain.replace(/_/g, " ")}
            </span>
            {entry.isVerified && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle className="w-3.5 h-3.5" /> Verified
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(!editing)}
              className="text-slate-400 hover:text-white p-1"
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={handleDelete}
              className="text-red-400 hover:text-red-300 p-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Question
              </label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white text-sm resize-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Answer
              </label>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white text-sm resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-medium text-white mb-3">
              {entry.question}
            </h2>
            <p className="text-slate-300 leading-relaxed whitespace-pre-wrap mb-4">
              {entry.answer}
            </p>
            {entry.keywords.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <Tag className="w-3.5 h-3.5 text-slate-500" />
                {entry.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </>
        )}

        <div className="mt-6 pt-4 border-t border-slate-700 text-xs text-slate-500">
          {entry.source && (
            <span>
              Source: {entry.source.name} ({entry.source.sourceType})
            </span>
          )}
          <span className="ml-4">
            Created: {new Date(entry.createdAt).toLocaleDateString()}
          </span>
        </div>
      </div>
    </div>
  );
}
