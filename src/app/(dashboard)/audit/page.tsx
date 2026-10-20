"use client";

import { useState, useEffect, useCallback } from "react";
import { ScrollText, ChevronLeft, ChevronRight, Search } from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; name: string | null; email: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const ENTITY_TYPES = [
  "Answer",
  "KnowledgeEntry",
  "KnowledgeSource",
  "Questionnaire",
  "Organization",
  "User",
];

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(pagination.page));
    params.set("limit", "50");
    if (actionFilter) params.set("action", actionFilter);
    if (entityFilter) params.set("entityType", entityFilter);

    try {
      const res = await fetch(`/api/audit-logs?${params}`);
      const json = await res.json();
      setLogs(json.data || []);
      setPagination((p) => ({ ...p, ...json.pagination }));
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [actionFilter, entityFilter, pagination.page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  function handleSearch() {
    setPagination((p) => ({ ...p, page: 1 }));
  }

  function formatAction(action: string) {
    return action
      .split(".")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" → ");
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <ScrollText className="w-6 h-6 text-indigo-400" />
        <h1 className="text-2xl font-bold text-white">Audit Trail</h1>
        <span className="ml-auto text-sm text-slate-500">
          {pagination.total} entries
        </span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Filter by action..."
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full pl-9 pr-3 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500"
          />
        </div>
        <select
          value={entityFilter}
          onChange={(e) => {
            setEntityFilter(e.target.value);
            setPagination((p) => ({ ...p, page: 1 }));
          }}
          className="px-3 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white text-sm"
        >
          <option value="">All entity types</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left py-3 px-4 text-slate-400 font-medium">
                  Time
                </th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">
                  User
                </th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">
                  Action
                </th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">
                  Entity
                </th>
                <th className="text-left py-3 px-4 text-slate-400 font-medium">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    Loading...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    No audit entries found
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-slate-800/50 hover:bg-slate-800/30"
                  >
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-white">
                      {log.user?.name || log.user?.email || "System"}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/15 text-indigo-400">
                        {formatAction(log.action)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {log.entityType && (
                        <span className="text-xs">
                          {log.entityType}
                          {log.entityId && (
                            <span className="text-slate-600 ml-1">
                              #{log.entityId.slice(0, 8)}
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 max-w-xs truncate">
                      {log.details
                        ? JSON.stringify(log.details).slice(0, 80)
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-500">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() =>
                setPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))
              }
              disabled={pagination.page <= 1}
              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() =>
                setPagination((p) => ({
                  ...p,
                  page: Math.min(p.totalPages, p.page + 1),
                }))
              }
              disabled={pagination.page >= pagination.totalPages}
              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
