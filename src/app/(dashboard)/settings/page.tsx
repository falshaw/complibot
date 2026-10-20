"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { LoadingBlocks, PageHeader } from "@/components/ui/PageHeader";

interface OrgData {
  id: string;
  name: string;
  confidenceThreshold: number;
  knowledgeEntryCount: number;
  questionnaireCount: number;
  userCount: number;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState(0.8);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/organizations")
      .then((r) => r.json())
      .then((d) => {
        if (!d.organization) return;
        setOrg(d.organization);
        setName(d.organization.name);
        setThreshold(d.organization.confidenceThreshold ?? 0.8);
      });
  }, []);

  async function save(what: string, body: Record<string, unknown>, ok: string) {
    if (!org) return;
    setSaving(what);
    try {
      const res = await fetch(`/api/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save");
      setOrg({ ...org, ...body });
      toast.success(ok);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(null);
    }
  }

  if (!org) return <LoadingBlocks rows={3} />;

  const t = Math.round(threshold * 100);
  const flagFloor = Math.round(threshold * 62.5);

  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow="Tools" title="Settings" />

      <section className="card mb-4 p-5">
        <h2 className="mb-3">Organization</h2>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) save("name", { name: name.trim() }, "Organization name saved");
          }}
        >
          <label className="grid gap-1.5">
            <span className="text-[13px] font-semibold">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={255} required />
          </label>
          <p className="text-xs text-ink-65">
            {org.knowledgeEntryCount} knowledge-base entries · {org.questionnaireCount} questionnaires · {org.userCount} users
          </p>
          <div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={!!saving || !name.trim() || name.trim() === org.name}>
              {saving === "name" ? "Saving…" : "Save name"}
            </button>
          </div>
        </form>
      </section>

      <section className="card mb-4 p-5">
        <h2 className="mb-1">Confidence threshold</h2>
        <p className="mb-4 text-[13px] text-ink-65">
          Drafts at or above the threshold go to review as pending. Drafts below it are flagged so a
          reviewer checks them first.
        </p>
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="threshold" className="text-[13px] font-semibold">
            Threshold
          </label>
          <span className="font-mono text-lg font-bold text-accent">{(threshold).toFixed(2)}</span>
        </div>
        <input
          id="threshold"
          type="range"
          min={10}
          max={100}
          step={5}
          value={t}
          onChange={(e) => setThreshold(Number(e.target.value) / 100)}
          className="w-full"
        />
        <div className="mt-1 flex justify-between text-xs text-ink-45">
          <span>0.10 · flag few</span>
          <span>1.00 · flag all</span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 text-center text-xs sm:grid-cols-3">
          <div className="rounded-xl bg-accent-soft p-3 text-accent">
            <b className="block">Pending</b>≥ {t}%
          </div>
          <div className="rounded-xl bg-amber-soft p-3 text-amber">
            <b className="block">Flagged</b>
            {flagFloor}% – {t - 1}%
          </div>
          <div className="rounded-xl bg-red-soft p-3 text-red">
            <b className="block">Flagged, low</b>&lt; {flagFloor}%
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm mt-4"
          onClick={() => save("threshold", { confidenceThreshold: threshold }, "Threshold saved")}
          disabled={!!saving || threshold === org.confidenceThreshold}
        >
          {saving === "threshold" ? "Saving…" : "Save threshold"}
        </button>
      </section>

      <section className="card p-5">
        <h2 className="mb-3">Your account</h2>
        <dl className="grid gap-2 text-[13px]">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-65">Name</dt>
            <dd>{session?.user?.name || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-65">Email</dt>
            <dd className="truncate">{session?.user?.email || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-65">Role</dt>
            <dd>{session?.user?.role || "—"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
