"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KnowledgeForm, type KnowledgeFormValues } from "@/components/KnowledgeForm";
import { PageHeader } from "@/components/ui/PageHeader";

export default function NewKnowledgeEntryPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create(v: KnowledgeFormValues) {
    setBusy(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not create the entry");
      toast.success("Entry added");
      router.push(`/knowledge/${data.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the entry");
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow={
          <>
            <Link href="/knowledge" className="hover:text-accent">
              Knowledge base
            </Link>{" "}
            / New entry
          </>
        }
        title="New entry"
        sub="Write the answer the way you would give it in a questionnaire."
      />
      <section className="card p-5">
        <KnowledgeForm submitLabel="Add entry" busy={busy} onSubmit={create} onCancel={() => router.push("/knowledge")} />
      </section>
    </div>
  );
}
