"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Send, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, LoadingBlocks, PageHeader } from "@/components/ui/PageHeader";
import { domainLabel } from "@/lib/ui/labels";

interface Message {
  role: "assistant" | "user";
  content: string;
  domain?: string;
}

interface InterviewState {
  id: string;
  status: string;
  currentDomain: string;
  domainIndex: number;
  questionIndex: number;
  totalDomains: number;
  entriesCreated: number;
  messages: Message[];
}

/** Must match SKIP_RESPONSE in InterviewService (never stored as an entry). */
const SKIP = "Skip this question";

export default function InterviewSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<InterviewState | null>(null);
  const [missing, setMissing] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/interview/${id}`).then(async (r) => {
      if (r.ok) setState(await r.json());
      else setMissing(true);
    });
  }, [id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state?.messages.length]);

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true);
    setInput("");
    setState((p) => (p ? { ...p, messages: [...p.messages, { role: "user", content: msg }] } : p));
    try {
      const res = await fetch(`/api/interview/${id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: msg }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not send the answer");
      setState(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send the answer");
      // restore the server state (drops the optimistic message)
      const r = await fetch(`/api/interview/${id}`);
      if (r.ok) setState(await r.json());
      setInput(msg === SKIP ? "" : msg);
    } finally {
      setSending(false);
    }
  }

  async function finish() {
    const res = await fetch(`/api/interview/${id}/complete`, { method: "POST" });
    if (!res.ok) return toast.error("Could not finish the interview");
    const data = await res.json().catch(() => ({}));
    toast.success(`Interview finished: ${data.entriesCreated ?? 0} knowledge-base entries added`);
    router.push("/knowledge");
  }

  if (missing) {
    return (
      <EmptyState title="Interview not found">
        <Link href="/knowledge/interview" className="btn btn-primary btn-sm">
          Start a new interview
        </Link>
      </EmptyState>
    );
  }
  if (!state) return <LoadingBlocks rows={2} />;

  const done = state.status !== "active";
  const progress = Math.round(
    ((state.domainIndex * 3 + state.questionIndex) / Math.max(1, state.totalDomains * 3)) * 100,
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col">
      <PageHeader
        eyebrow={
          <>
            <Link href="/knowledge/interview" className="hover:text-accent">
              AI interview
            </Link>{" "}
            / {domainLabel(state.currentDomain)}
          </>
        }
        title="AI interview"
        sub={`${state.entriesCreated} ${state.entriesCreated === 1 ? "entry" : "entries"} added so far`}
        actions={
          !done && (
            <button type="button" className="btn btn-primary btn-sm" onClick={finish} disabled={sending}>
              Finish
            </button>
          )
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <span className="track flex-1" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Interview progress">
          <span style={{ width: `${progress}%` }} />
        </span>
        <span className="text-xs text-ink-65">
          Domain {Math.min(state.domainIndex + 1, state.totalDomains)} of {state.totalDomains}
        </span>
      </div>

      <section className="card mb-4 grid max-h-[60vh] gap-3 overflow-y-auto p-4" aria-live="polite" aria-label="Conversation">
        {state.messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`chat-bubble ${m.role === "user" ? "chat-me" : "chat-ai"}`}>
              {m.role === "assistant" && m.domain && (
                <span className="eyebrow mb-1 block !text-accent">{domainLabel(m.domain)}</span>
              )}
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="chat-bubble chat-ai inline-flex items-center gap-2 text-ink-65">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving your answer…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </section>

      {done ? (
        <div className="alert alert-ok">
          This interview is finished.{" "}
          <Link href="/knowledge" className="font-semibold underline">
            See the knowledge base
          </Link>
        </div>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            className="input flex-1"
            rows={3}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Type your answer. Enter sends, Shift+Enter adds a line."
            aria-label="Your answer"
            disabled={sending}
          />
          <div className="flex flex-col gap-2">
            <button type="submit" className="btn btn-primary btn-sm !h-10" disabled={!input.trim() || sending} aria-label="Send answer">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            </button>
            <button type="button" className="btn btn-ghost btn-sm !h-10" onClick={() => send(SKIP)} disabled={sending} aria-label="Skip this question" title="Skip this question">
              <SkipForward className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
