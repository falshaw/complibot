"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Send, Loader2, CheckCircle, SkipForward } from "lucide-react";
import { toast } from "sonner";

interface Message {
  role: "assistant" | "user";
  content: string;
  domain?: string;
}

interface InterviewState {
  id: string;
  status: string;
  currentDomain: string;
  currentQuestion: string;
  domainIndex: number;
  questionIndex: number;
  totalDomains: number;
  entriesCreated: number;
  messages: Message[];
}

const DOMAIN_LABELS: Record<string, string> = {
  ACCESS_CONTROL: "Access Control",
  AUTHENTICATION: "Authentication",
  ENCRYPTION: "Encryption",
  DATA_PROTECTION: "Data Protection",
  INCIDENT_RESPONSE: "Incident Response",
  NETWORK_SECURITY: "Network Security",
  CLOUD_SECURITY: "Cloud Security",
  PHYSICAL_SECURITY: "Physical Security",
  BUSINESS_CONTINUITY: "Business Continuity",
  CHANGE_MANAGEMENT: "Change Management",
  VULNERABILITY_MANAGEMENT: "Vulnerability Management",
  LOGGING_MONITORING: "Logging & Monitoring",
  THIRD_PARTY_RISK: "Third Party Risk",
  COMPLIANCE: "Compliance",
  PRIVACY: "Privacy",
  ENDPOINT_SECURITY: "Endpoint Security",
  APPLICATION_SECURITY: "Application Security",
  IDENTITY_MANAGEMENT: "Identity Management",
  GOVERNANCE: "Governance",
  GENERAL: "General",
};

export default function InterviewSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<InterviewState | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/interview/${id}`)
      .then((r) => r.json())
      .then(setState)
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.messages]);

  async function handleSend() {
    if (!input.trim() || sending) return;
    setSending(true);

    const userMsg = input.trim();
    setInput("");

    // Optimistic UI
    setState((prev) =>
      prev
        ? {
            ...prev,
            messages: [...prev.messages, { role: "user", content: userMsg }],
          }
        : prev,
    );

    try {
      const res = await fetch(`/api/interview/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: userMsg }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setState(data);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to send response",
      );
    } finally {
      setSending(false);
    }
  }

  async function handleComplete() {
    try {
      await fetch(`/api/interview/${id}/complete`, { method: "POST" });
      toast.success("Interview completed! Knowledge entries added to your KB.");
      router.push("/knowledge");
    } catch {
      toast.error("Failed to complete interview");
    }
  }

  if (loading)
    return <div className="text-slate-400 text-center py-12">Loading...</div>;
  if (!state)
    return (
      <div className="text-red-400 text-center py-12">Interview not found</div>
    );

  const progress =
    state.totalDomains > 0
      ? Math.round(
          ((state.domainIndex * 3 + state.questionIndex) /
            (state.totalDomains * 3)) *
            100,
        )
      : 0;

  return (
    <div className="h-full flex flex-col max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold text-white">AI Interview</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">
              {state.entriesCreated} entries created
            </span>
            <button
              onClick={handleComplete}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1"
            >
              <CheckCircle className="w-3.5 h-3.5" /> Finish
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs text-slate-500">
            {DOMAIN_LABELS[state.currentDomain] || state.currentDomain}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {state.messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-200 border border-slate-700"
              }`}
            >
              {msg.domain && (
                <span className="text-xs text-indigo-400 block mb-1">
                  {DOMAIN_LABELS[msg.domain] || msg.domain}
                </span>
              )}
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {state.status !== "COMPLETED" && (
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type your answer... (Enter to send, Shift+Enter for new line)"
            rows={3}
            className="flex-1 bg-[#0f172a] border border-slate-700 rounded-lg px-4 py-3 text-white text-sm resize-none focus:outline-none focus:border-indigo-500"
          />
          <div className="flex flex-col gap-2">
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => {
                setInput("Skip this question");
                handleSend();
              }}
              disabled={sending}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg"
              title="Skip question"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
