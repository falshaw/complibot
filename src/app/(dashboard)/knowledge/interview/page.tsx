"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function StartInterviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    try {
      const res = await fetch("/api/interview", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      router.push(`/knowledge/interview/${data.sessionId}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start interview",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="card-panel text-center py-16">
        <MessageSquare className="w-16 h-16 text-indigo-400 mx-auto mb-6" />
        <h1 className="text-2xl font-bold text-white mb-3">
          AI Knowledge Interview
        </h1>
        <p className="text-slate-400 mb-2 max-w-md mx-auto">
          Answer questions about your organization&apos;s security posture. The
          AI will extract knowledge entries from your responses to build your
          knowledge base.
        </p>
        <p className="text-sm text-slate-500 mb-8">
          Covers 20 security domains. Takes about 15-20 minutes.
        </p>
        <button
          onClick={handleStart}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-6 py-3 rounded-lg font-medium inline-flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <MessageSquare className="w-5 h-5" />
          )}
          Start Interview
        </button>
      </div>
    </div>
  );
}
