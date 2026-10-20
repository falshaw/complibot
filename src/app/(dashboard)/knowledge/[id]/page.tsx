"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { KnowledgeForm, type KnowledgeFormValues } from "@/components/KnowledgeForm";
import { EmptyState, LoadingBlocks, PageHeader } from "@/components/ui/PageHeader";
import { domainLabel } from "@/lib/ui/labels";

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

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function KnowledgeEntryPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [entry, setEntry] = useState<KnowledgeEntry | null>(null);
  const [missing, setMissing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/knowledge/${id}`).then(async (r) => {
      if (r.ok) setEntry(await r.json());
      else setMissing(true);
    });
  }, [id]);

  async function patch(body: Partial<KnowledgeFormValues> & { isVerified?: boolean }, ok: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/knowledge/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      setEntry(data);
      setEditing(false);
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this knowledge entry? Answers that cited it keep their text.")) return;
    setBusy(true);
    const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Entry deleted");
      router.push("/knowledge");
    } else {
      toast.error("Could not delete the entry");
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <EmptyState title="Entry not found" text="It may have been deleted.">
        <Link href="/knowledge" className="btn btn-primary btn-sm">
          Back to the knowledge base
        </Link>
      </EmptyState>
    );
  }
  if (!entry) return <LoadingBlocks rows={2} />;

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow={
          <>
            <Link href="/knowledge" className="hover:text-accent">
              Knowledge base
            </Link>{" "}
            / Entry
          </>
        }
        title={editing ? "Edit entry" : "Knowledge entry"}
        actions={
          !editing && (
            <>
              <button
                type="button"
                className={`btn btn-sm ${entry.isVerified ? "btn-ghost" : "btn-primary"}`}
                onClick={() =>
                  patch(
                    { isVerified: !entry.isVerified },
                    entry.isVerified ? "Marked as not verified" : "Entry verified",
                  )
                }
                disabled={busy}
              >
                {entry.isVerified ? "Unverify" : "Verify"}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(true)} disabled={busy}>
                Edit
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={remove} disabled={busy}>
                Delete
              </button>
            </>
          )
        }
      />

      <section className="card p-5">
        {editing ? (
          <KnowledgeForm
            initial={entry}
            submitLabel="Save changes"
            busy={busy}
            onSubmit={(v) => patch(v, "Entry updated")}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="badge b-blue">{domainLabel(entry.domain)}</span>
              {entry.isVerified ? (
                <span className="badge b-teal">verified</span>
              ) : (
                <span className="badge b-grey">not verified</span>
              )}
            </div>
            <h2 className="!text-lg">{entry.question}</h2>
            <p className="mt-3 whitespace-pre-wrap leading-relaxed text-ink">{entry.answer}</p>
            {entry.keywords.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {entry.keywords.map((k) => (
                  <span key={k} className="rounded-full bg-line-2 px-2.5 py-0.5 font-mono text-xs text-ink-65">
                    {k}
                  </span>
                ))}
              </div>
            )}
            <dl className="mt-5 grid gap-1 border-t border-line-2 pt-4 text-xs text-ink-65 sm:grid-cols-3">
              <div>
                <dt className="eyebrow">Source</dt>
                <dd>{entry.source ? `${entry.source.name} (${entry.source.sourceType.toLowerCase()})` : "Added by hand"}</dd>
              </div>
              <div>
                <dt className="eyebrow">Created</dt>
                <dd>{fmt(entry.createdAt)}</dd>
              </div>
              <div>
                <dt className="eyebrow">Updated</dt>
                <dd>{fmt(entry.updatedAt)}</dd>
              </div>
            </dl>
          </>
        )}
      </section>
    </div>
  );
}
