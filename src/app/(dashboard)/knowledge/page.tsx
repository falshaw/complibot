"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BookOpen,
  Upload,
  Search,
  Filter,
  Plus,
  CheckCircle,
} from "lucide-react";

interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  domain: string;
  isVerified: boolean;
  keywords: string[];
  source: { name: string; sourceType: string } | null;
  createdAt: string;
}

const DOMAINS = [
  "ALL",
  "ACCESS_CONTROL",
  "AUTHENTICATION",
  "ENCRYPTION",
  "DATA_PROTECTION",
  "INCIDENT_RESPONSE",
  "NETWORK_SECURITY",
  "CLOUD_SECURITY",
  "PHYSICAL_SECURITY",
  "BUSINESS_CONTINUITY",
  "CHANGE_MANAGEMENT",
  "VULNERABILITY_MANAGEMENT",
  "LOGGING_MONITORING",
  "THIRD_PARTY_RISK",
  "COMPLIANCE",
  "PRIVACY",
  "ENDPOINT_SECURITY",
  "APPLICATION_SECURITY",
  "IDENTITY_MANAGEMENT",
  "GOVERNANCE",
  "GENERAL",
];

export default function KnowledgePage() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("ALL");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) params.set("search", search);
    if (domain !== "ALL") params.set("domain", domain);

    fetch(`/api/knowledge?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setEntries(data.entries || []);
        setTotal(data.total || 0);
      })
      .finally(() => setLoading(false));
  }, [search, domain, page]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/knowledge/upload"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Upload className="w-4 h-4" /> Upload Source
          </Link>
          <Link
            href="/knowledge/interview"
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> AI Interview
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search questions or answers..."
            className="w-full pl-10 pr-3 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <select
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setPage(1);
            }}
            className="pl-10 pr-3 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white text-sm appearance-none cursor-pointer"
          >
            {DOMAINS.map((d) => (
              <option key={d} value={d}>
                {d === "ALL" ? "All Domains" : d.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-sm text-slate-400 mb-3">{total} entries</div>

      {loading ? (
        <div className="text-slate-400 text-center py-12">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="card-panel text-center py-16">
          <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg text-white mb-2">Knowledge base is empty</h3>
          <p className="text-slate-400 mb-4">
            Upload past questionnaires or start an AI interview
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="card-panel">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-indigo-500/15 text-indigo-400 px-2 py-0.5 rounded">
                      {entry.domain.replace(/_/g, " ")}
                    </span>
                    {entry.isVerified && (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    {entry.source && (
                      <span className="text-xs text-slate-500">
                        from {entry.source.name}
                      </span>
                    )}
                  </div>
                  <p className="text-white text-sm font-medium mb-1 line-clamp-1">
                    {entry.question}
                  </p>
                  <p className="text-slate-400 text-sm line-clamp-2">
                    {entry.answer}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm text-slate-400 hover:text-white disabled:opacity-30"
          >
            Previous
          </button>
          <span className="text-sm text-slate-500">Page {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={entries.length < 20}
            className="text-sm text-slate-400 hover:text-white disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
