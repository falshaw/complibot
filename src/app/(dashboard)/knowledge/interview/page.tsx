"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReadOnlyNote, useCan } from "@/components/RoleContext";

function StartInterviewForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    try {
      const res = await fetch("/api/interview", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not start the interview");
      router.push(`/knowledge/interview/${data.sessionId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start the interview");
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Tools"
        title="AI interview"
        sub="Answer questions about your security posture in plain words. Each answer is turned into knowledge-base entries."
      />
      <section className="card mx-auto max-w-xl px-6 py-10 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent">
          <MessageSquare className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="!text-lg">Build the knowledge base by talking it through</h2>
        <p className="mx-auto mt-2 max-w-md text-[13px] text-ink-65">
          Up to three questions per security domain, across 20 domains. Skip what does not apply and
          finish whenever you like; entries are saved as you go. Extraction uses the local model, so
          each reply can take a minute.
        </p>
        <button type="button" onClick={start} disabled={loading} className="btn btn-primary mt-6">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MessageSquare className="h-4 w-4" aria-hidden />}
          Start interview
        </button>
      </section>
    </>
  );
}

/** Roles that cannot run the AI interview get a note instead of a form that would fail. */
export default function StartInterviewPage() {
  const allowed = useCan("knowledge");
  if (!allowed) {
    return (
      <>
        <PageHeader eyebrow="Tools" title="AI interview" />
        <ReadOnlyNote permission="knowledge" what="run the AI interview, which adds knowledge-base entries" />
      </>
    );
  }
  return <StartInterviewForm />;
}
