"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, ScrollText, Search } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string } | null;
}

interface Pagination {
  page: number;
  total: number;
  totalPages: number;
}

const ENTITY_TYPES: Record<string, string> = {
  Answer: "Answers",
  KnowledgeEntry: "Knowledge-base entries",
  KnowledgeSource: "Knowledge sources",
  Questionnaire: "Questionnaires",
  InterviewSession: "AI interviews",
  Organization: "Organization",
  OrganizationInvitation: "Invitations",
  QuestionnaireTemplate: "Templates",
  User: "Team members",
};

function actionTone(action: string) {
  if (/delete|reject|remove|revoke/.test(action)) return "b-red";
  if (/approve|verify|complete|join|reactivate/.test(action)) return "b-teal";
  if (/edit|update|regenerate/.test(action)) return "b-amber";
  return "b-blue";
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function details(d: Record<string, unknown> | null) {
  if (!d) return "—";
  return Object.entries(d)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : String(v)}`)
    .join("  ");
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [pg, setPg] = useState<Pagination>({ page: 1, total: 0, totalPages: 0 });
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [actionQuery, setActionQuery] = useState("");
  const [entity, setEntity] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setActionQuery(action.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [action]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (actionQuery) params.set("action", actionQuery);
    if (entity) params.set("entityType", entity);
    fetch(`/api/audit-logs?${params}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        setLogs(json.data || []);
        setPg(json.pagination || { page: 1, total: 0, totalPages: 0 });
      })
      .catch(() => !cancelled && setLogs([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, actionQuery, entity]);

  return (
    <>
      <PageHeader
        eyebrow="Tools"
        title="Audit trail"
        sub="Every review decision and change to the knowledge base, questionnaires, settings and team."
        actions={<span className="pill p-grey">{pg.total} {pg.total === 1 ? "entry" : "entries"}</span>}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-45" aria-hidden />
          <input type="search" className="input !pl-10" placeholder="Filter by action, e.g. approve" aria-label="Filter by action" value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
        <select
          className="input sm:!w-60"
          aria-label="Filter by record type"
          value={entity}
          onChange={(e) => {
            setEntity(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All record types</option>
          {Object.entries(ENTITY_TYPES).map(([t, label]) => (
            <option key={t} value={t}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {!loading && logs.length === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          title={actionQuery || entity ? "No matching entries" : "No activity yet"}
          text="Approving answers, editing the knowledge base, exports and team changes are recorded here."
        />
      ) : (
        <div className="card overflow-x-auto" aria-busy={loading}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th className="hidden md:table-cell">Record</th>
                <th className="hidden lg:table-cell">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap font-mono text-xs text-ink-65">{fmt(l.createdAt)}</td>
                  <td className="max-w-[160px] truncate">{l.user?.name || l.user?.email || "System"}</td>
                  <td>
                    <span className={`badge ${actionTone(l.action)}`}>{l.action}</span>
                  </td>
                  <td className="hidden font-mono text-xs text-ink-65 md:table-cell">
                    {l.entityType}
                    {l.entityId && <span className="text-ink-45"> #{l.entityId.slice(-8)}</span>}
                  </td>
                  <td className="hidden max-w-[320px] truncate font-mono text-xs text-ink-65 lg:table-cell" title={details(l.details)}>
                    {details(l.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pg.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[13px] text-ink-65">
          <span>
            Page {pg.page} of {pg.totalPages}
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pg.totalPages} aria-label="Next page">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
