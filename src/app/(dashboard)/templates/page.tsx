/**
 * CompliBot - Questionnaire templates (CB-03)
 * Built-in + custom templates: start an assessment, copy, preview questions.
 * Custom templates (copies) can be edited and deleted; built-ins are read-only.
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, Loader2, Pencil, Play, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TemplateEditor, type EditableTemplate } from "@/components/TemplateEditor";
import { EmptyState, LoadingBlocks, PageHeader } from "@/components/ui/PageHeader";
import { domainLabel, typeLabel } from "@/lib/ui/labels";
import { can } from "@/lib/permissions";
import { useRole } from "@/components/RoleContext";

interface TemplateQuestion {
  text: string;
  type: string;
  domain: string;
  required: boolean;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  framework: string | null;
  version: string;
  isBuiltIn: boolean;
  questionCount: number;
  domains: string[];
  questions?: TemplateQuestion[];
}

async function fetchTemplates(): Promise<Template[]> {
  try {
    const res = await fetch("/api/templates");
    const json = await res.json();
    return json.success ? json.templates : [];
  } catch {
    toast.error("Could not load templates");
    return [];
  }
}

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [search, setSearch] = useState("");
  const [framework, setFramework] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Template | null>(null);

  const [editing, setEditing] = useState<EditableTemplate | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const role = useRole();
  const canWrite = can(role, "draft");

  const load = useCallback(async () => {
    setTemplates(await fetchTemplates());
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchTemplates().then((t) => !cancelled && setTemplates(t));
    return () => {
      cancelled = true;
    };
  }, []);

  async function openEditor(t: Template) {
    setBusy(`edit-${t.id}`);
    try {
      const res = await fetch(`/api/templates/${t.id}`);
      const json = await res.json();
      if (!json.success) throw new Error();
      setEditing(json.template);
    } catch {
      toast.error("Could not load the template");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(`delete-${deleting.id}`);
    setDeleteError("");
    const res = await fetch(`/api/templates/${deleting.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      setDeleteError(
        res?.status === 403 ? "Only admins and responders can delete templates." : "The template was not deleted. Try again.",
      );
      return;
    }
    toast.success(`Deleted “${deleting.name}”`);
    setDeleting(null);
    await load();
  }

  async function openPreview(id: string) {
    setBusy(`preview-${id}`);
    try {
      const res = await fetch(`/api/templates/${id}`);
      const json = await res.json();
      if (!json.success) throw new Error();
      setPreview(json.template);
    } catch {
      toast.error("Could not load the template");
    } finally {
      setBusy(null);
    }
  }

  async function clone(t: Template) {
    setBusy(`clone-${t.id}`);
    try {
      const res = await fetch(`/api/templates/${t.id}`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success(`Copied “${t.name}” to your templates`);
      await load();
    } catch {
      toast.error("Could not copy the template");
    } finally {
      setBusy(null);
    }
  }

  async function start(t: Template) {
    setBusy(`start-${t.id}`);
    try {
      const res = await fetch("/api/questionnaires/from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: t.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.questionnaire) throw new Error(json.error);
      toast.success(`Started ${json.questionnaire.name}`);
      router.push(`/questionnaires/${json.questionnaire.id}`);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Could not start the assessment");
      setBusy(null);
    }
  }

  if (templates === null) return <LoadingBlocks />;

  const frameworks = ["all", ...new Set(templates.map((t) => t.framework).filter((f): f is string => !!f))];
  const term = search.toLowerCase();
  const filtered = templates.filter(
    (t) =>
      (framework === "all" || t.framework === framework) &&
      [t.name, t.framework, t.description].some((v) => v?.toLowerCase().includes(term)),
  );
  const groups = [
    { title: "Built-in frameworks", items: filtered.filter((t) => t.isBuiltIn) },
    { title: "Your templates", items: filtered.filter((t) => !t.isBuiltIn) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Templates"
        title="Templates"
        sub="Start an assessment from a standard framework. Its questions are created already parsed, ready for answer generation."
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-45" aria-hidden />
          <input type="search" className="input !pl-10" placeholder="Search templates…" aria-label="Search templates" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by framework">
          {frameworks.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFramework(f)}
              aria-pressed={framework === f}
              className={`btn btn-sm ${framework === f ? "btn-primary" : "btn-ghost"}`}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && <EmptyState title="No templates match" text="Clear the search or pick another framework." />}

      {groups.map(
        (g) =>
          g.items.length > 0 && (
            <section key={g.title} className="mb-6">
              <h2 className="eyebrow mb-3">
                {g.title} ({g.items.length})
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {g.items.map((t) => (
                  <article key={t.id} className="card flex flex-col p-[18px]">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <h3 className="min-w-0 font-bold">{t.name}</h3>
                      {t.framework && <span className="badge b-blue shrink-0">{t.framework}</span>}
                    </div>
                    {t.description && <p className="mb-3 line-clamp-2 text-[13px] text-ink-65">{t.description}</p>}
                    <p className="mt-auto mb-4 font-mono text-xs text-ink-65">
                      {t.questionCount} questions · {t.domains.length} domains · v{t.version}
                    </p>
                    <div className="flex gap-2">
                      {canWrite && (
                        <button type="button" className="btn btn-primary btn-sm flex-1" onClick={() => start(t)} disabled={!!busy}>
                          {busy === `start-${t.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
                          Start assessment
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm !px-3" onClick={() => openPreview(t.id)} disabled={!!busy} aria-label={`Preview ${t.name}`} title="Preview questions">
                        {busy === `preview-${t.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                      </button>
                      {canWrite && t.isBuiltIn && (
                        <button type="button" className="btn btn-ghost btn-sm !px-3" onClick={() => clone(t)} disabled={!!busy} aria-label={`Copy ${t.name} to your templates`} title="Copy to your templates">
                          {busy === `clone-${t.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                        </button>
                      )}
                      {canWrite && !t.isBuiltIn && (
                        <>
                          <button type="button" className="btn btn-ghost btn-sm !px-3" onClick={() => openEditor(t)} disabled={!!busy} aria-label={`Edit ${t.name}`} title="Edit template">
                            {busy === `edit-${t.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Pencil className="h-3.5 w-3.5" aria-hidden />}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm !px-3"
                            onClick={() => {
                              setDeleteError("");
                              setDeleting(t);
                            }}
                            disabled={!!busy}
                            aria-label={`Delete ${t.name}`}
                            title="Delete template"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ),
      )}

      {preview && <PreviewModal template={preview} busy={busy} onClose={() => setPreview(null)} onStart={canWrite ? () => start(preview) : undefined} />}

      {editing && (
        <TemplateEditor
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={async (name) => {
            setEditing(null);
            toast.success(`Saved “${name}”`);
            await load();
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Delete this template?"
        confirmLabel="Delete template"
        busy={!!busy}
        error={deleteError}
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      >
        <p>
          <b className="text-ink">{deleting?.name}</b> and its {deleting?.questionCount} questions will be removed from your
          templates. Assessments already started from it keep their questions. This cannot be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}

function PreviewModal({
  template,
  busy,
  onClose,
  onStart,
}: {
  template: Template;
  busy: string | null;
  onClose: () => void;
  onStart?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const questions = template.questions ?? [];
  const groups = questions.reduce<Record<string, TemplateQuestion[]>>((acc, q) => {
    (acc[q.domain || "GENERAL"] ??= []).push(q);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tpl-title"
        className="glass flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden !bg-canvas/95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <h2 id="tpl-title" className="!text-lg">
              {template.name}
            </h2>
            {template.description && <p className="mt-1 text-[13px] text-ink-65">{template.description}</p>}
          </div>
          <button type="button" className="theme-btn !px-2" onClick={onClose} aria-label="Close preview" autoFocus>
            <X aria-hidden />
          </button>
        </div>
        <div className="grid gap-5 overflow-y-auto p-5">
          {Object.entries(groups).map(([domain, qs]) => (
            <section key={domain}>
              <h3 className="eyebrow mb-2 !text-accent">
                {domainLabel(domain)} ({qs.length})
              </h3>
              <ol className="grid gap-2">
                {qs.map((q, i) => (
                  <li key={i} className="card flex gap-3 p-3 text-[13px]">
                    <span className="font-mono text-ink-45">{i + 1}.</span>
                    <span className="min-w-0">
                      {q.text}
                      <span className="mt-1 flex gap-2 text-xs text-ink-65">
                        <span>{typeLabel(q.type)}</span>
                        {q.required && <span className="text-amber">required</span>}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <div className="flex gap-2 border-t border-line p-4">
          {onStart && (
            <button type="button" className="btn btn-primary flex-1" onClick={onStart} disabled={!!busy}>
              {busy === `start-${template.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              Start assessment ({questions.length} questions)
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
