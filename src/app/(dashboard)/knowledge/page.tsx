"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BookOpen, Plus, Search, Upload } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { SECURITY_DOMAINS, domainLabel } from "@/lib/ui/labels";

interface KnowledgeEntry {
  id: string;
  question: string;
  answer: string;
  domain: string;
  isVerified: boolean;
  source: { name: string; sourceType: string } | null;
  updatedAt: string;
}

interface Source {
  id: string;
  name: string;
  status: string;
  entriesCreated: number;
  errorMessage: string | null;
  createdAt: string;
}

const PAGE_SIZE = 20;

const SOURCE_TONE: Record<string, string> = {
  completed: "b-teal",
  processing: "b-blue",
  pending: "b-grey",
  failed: "b-red",
};

export default function KnowledgePage() {
  // ?search= from the dashboard search box
  const initial = useSearchParams().get("search") ?? "";
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState(initial);
  const [query, setQuery] = useState(initial);
  const [domain, setDomain] = useState("");
  const [page, setPage] = useState(1);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);

  // Debounce typing
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() === query) return;
      setQuery(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search, query]);

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (query) params.set("search", query);
  if (domain) params.set("domain", domain);
  const key = params.toString();
  const loading = loadedKey !== key;

  useEffect(() => {
    let live = true;
    fetch(`/api/knowledge?${key}`)
      .then((r) => (r.ok ? r.json() : { entries: [], total: 0 }))
      .then((data) => {
        if (!live) return;
        setEntries(data.entries || []);
        setTotal(data.total || 0);
        setLoadedKey(key);
      });
    return () => {
      live = false;
    };
  }, [key]);

  useEffect(() => {
    fetch("/api/sources")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSources((d?.sources ?? []).slice(0, 5)))
      .catch(() => {});
  }, []);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="Knowledge base"
        title="Knowledge Base"
        sub="Question and answer pairs the AI cites when it drafts answers."
        actions={
          <>
            <Link href="/knowledge/new" className="btn btn-primary btn-sm">
              <Plus className="h-3.5 w-3.5" aria-hidden /> New entry
            </Link>
            <Link href="/knowledge/upload" className="btn btn-ghost btn-sm">
              <Upload className="h-3.5 w-3.5" aria-hidden /> Upload source
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-45" aria-hidden />
          <input
            type="search"
            className="input !pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions, answers or keywords…"
            aria-label="Search knowledge base"
          />
        </div>
        <select
          className="input sm:!w-60"
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by domain"
        >
          <option value="">All domains</option>
          {SECURITY_DOMAINS.map((d) => (
            <option key={d} value={d}>
              {domainLabel(d)}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-3 text-[13px] text-ink-65" aria-live="polite">
        {loading ? "Loading…" : `${total} ${total === 1 ? "entry" : "entries"}`}
        {query && !loading && <> matching “{query}”</>}
      </div>

      {!loading && entries.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title={query || domain ? "No matching entries" : "Knowledge base is empty"}
          text={
            query || domain
              ? "Try another search term or domain."
              : "Add an entry by hand, upload past questionnaires with their answers, or run the AI interview."
          }
        >
          <Link href="/knowledge/new" className="btn btn-primary btn-sm">
            New entry
          </Link>
          <Link href="/knowledge/interview" className="btn btn-ghost btn-sm">
            AI interview
          </Link>
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-line-2 overflow-hidden">
          {entries.map((e) => (
            <li key={e.id}>
              <Link href={`/knowledge/${e.id}`} className="block px-4 py-3.5 hover:bg-g-bg">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="badge b-blue">{domainLabel(e.domain)}</span>
                  {e.isVerified ? (
                    <span className="badge b-teal">verified</span>
                  ) : (
                    <span className="badge b-grey">not verified</span>
                  )}
                  <span className="text-xs text-ink-45">
                    {e.source ? `from ${e.source.name}` : "entered in the app"}
                  </span>
                </div>
                <p className="truncate font-semibold">{e.question}</p>
                <p className="line-clamp-2 text-[13px] text-ink-65">{e.answer}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-[13px]">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
            Previous
          </button>
          <span className="text-ink-65">
            Page {page} of {pages}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pages}>
            Next
          </button>
        </div>
      )}

      {sources.length > 0 && (
        <section className="card mt-5 p-[18px]">
          <h2 className="mb-3">Uploaded sources</h2>
          <ul className="divide-y divide-line-2 text-[13px]">
            {sources.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="min-w-0 truncate font-mono">{s.name}</span>
                <span className="flex items-center gap-3 text-ink-65">
                  {s.status === "completed" && <span>{s.entriesCreated} entries</span>}
                  {s.status === "failed" && s.errorMessage && (
                    <span className="max-w-[260px] truncate text-red" title={s.errorMessage}>
                      {s.errorMessage}
                    </span>
                  )}
                  <span className={`badge ${SOURCE_TONE[s.status] ?? "b-grey"}`}>{s.status}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
