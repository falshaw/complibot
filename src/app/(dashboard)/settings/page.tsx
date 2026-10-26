"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useRole } from "@/components/RoleContext";
import { PASSWORD_MIN_LENGTH, passwordSchema } from "@/lib/validators/password";
import { LoadingBlocks, PageHeader } from "@/components/ui/PageHeader";
import { plural } from "@/lib/ui/labels";

interface OrgData {
  id: string;
  name: string;
  confidenceThreshold: number;
  knowledgeEntryCount: number;
  questionnaireCount: number;
  userCount: number;
}

interface Me {
  name: string | null;
  email: string;
  role: string;
}

export default function SettingsPage() {
  const isAdmin = useRole() === "ADMIN";
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

  if (!isAdmin) {
    return (
      <div className="max-w-2xl">
        <PageHeader eyebrow="Tools" title="Settings" />
        <section className="card mb-4 p-5">
          <h2 className="mb-2">Organization</h2>
          <p className="text-[13.5px]">
            <b>{org.name}</b> · confidence threshold <b className="font-mono">{org.confidenceThreshold.toFixed(2)}</b>
          </p>
          <p className="mt-1 text-xs text-ink-65">Only admins change the organization settings.</p>
        </section>
        <AccountSection />
      </div>
    );
  }

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
            {plural(org.knowledgeEntryCount, "knowledge-base entry", "knowledge-base entries")} · {plural(org.questionnaireCount, "questionnaire")} ·{" "}
            {plural(org.userCount, "user")}
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

      <AccountSection />
    </div>
  );
}

/** Your own name and password: every role may change these. */
function AccountSection() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [pwError, setPwError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Me | null) => {
        if (!d) return;
        setMe(d);
        setName(d.name ?? "");
      })
      .catch(() => {});
  }, []);

  async function patch(body: Record<string, string>) {
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.details?.[0]?.message || data.error || "Could not save");
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setBusy("name");
    try {
      await patch({ name: name.trim() });
      setMe((m) => (m ? { ...m, name: name.trim() } : m));
      toast.success("Name saved");
      router.refresh(); // the sidebar shows the name
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    const rule = passwordSchema.safeParse(next);
    if (!rule.success) return setPwError(rule.error.issues[0].message);
    if (next !== repeat) return setPwError("The new passwords do not match");
    setBusy("password");
    try {
      await patch({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setRepeat("");
      toast.success("Password changed");
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Could not change the password");
    } finally {
      setBusy(null);
    }
  }

  if (!me) return null;

  return (
    <section className="card p-5">
      <h2 className="mb-3">Your account</h2>
      <p className="mb-4 text-[13px] text-ink-65">
        {me.email} · {me.role.charAt(0) + me.role.slice(1).toLowerCase()}
      </p>
      <form className="mb-5 grid gap-2" onSubmit={saveName}>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">Display name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoComplete="name" />
        </label>
        <div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!!busy || !name.trim() || name.trim() === (me.name ?? "")}>
            {busy === "name" ? "Saving…" : "Save name"}
          </button>
        </div>
      </form>
      <form className="grid gap-2" onSubmit={savePassword} noValidate>
        <span className="text-[13px] font-semibold">Change password</span>
        <input
          className="input"
          type="password"
          aria-label="Current password"
          placeholder="Current password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
        <input
          className="input"
          type="password"
          aria-label="New password"
          placeholder="New password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <input
          className="input"
          type="password"
          aria-label="Repeat the new password"
          placeholder="Repeat the new password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
        {pwError ? (
          <p className="text-[13px] font-medium text-red" role="alert">
            {pwError}
          </p>
        ) : (
          <p className="text-xs text-ink-65">At least {PASSWORD_MIN_LENGTH} characters, including a special character.</p>
        )}
        <div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!!busy || !current || !next || !repeat}>
            {busy === "password" ? "Saving…" : "Change password"}
          </button>
        </div>
      </form>
    </section>
  );
}
