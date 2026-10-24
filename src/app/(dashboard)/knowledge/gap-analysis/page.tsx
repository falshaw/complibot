"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { EmptyState, LoadingBlocks, PageHeader } from "@/components/ui/PageHeader";
import { can } from "@/lib/permissions";
import { plural } from "@/lib/ui/labels";

interface DomainAnalysis {
  domain: string;
  label: string;
  entries: number;
  verified: number;
  confidence: number | null; // avg confidence of drafted answers, null = no drafts yet
  questionsAsked: number;
  coverage: "strong" | "adequate" | "weak" | "none";
  gapScore: number;
}

interface GapData {
  overallScore: number;
  totalEntries: number;
  summary: { strong: number; adequate: number; weak: number; none: number };
  domains: DomainAnalysis[];
  gaps: DomainAnalysis[];
  recommendations: string[];
}

const conf = (c: number | null) => (c === null ? "no drafts" : `${c}%`);

const COVERAGE: Record<DomainAnalysis["coverage"], { badge: string; bar: string }> = {
  strong: { badge: "b-teal", bar: "var(--teal)" },
  adequate: { badge: "b-blue", bar: "var(--accent)" },
  weak: { badge: "b-amber", bar: "var(--amber)" },
  none: { badge: "b-grey", bar: "var(--ink-45)" },
};

export default function GapAnalysisPage() {
  const canEdit = can(useSession().data?.user?.role, "knowledge");
  const [data, setData] = useState<GapData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/knowledge/gap-analysis")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true));
  }, []);

  if (failed) return <EmptyState title="Could not load the gap analysis" text="Reload the page to try again." />;
  if (!data) return <LoadingBlocks />;

  const maxEntries = Math.max(5, ...data.domains.map((d) => d.entries));
  const stats = [
    { label: "Overall coverage", value: `${data.overallScore}%`, color: "var(--ink)" },
    { label: "Strong domains", value: data.summary.strong, color: "var(--teal)" },
    { label: "Weak or empty", value: data.summary.weak + data.summary.none, color: "var(--amber)" },
    { label: "KB entries", value: data.totalEntries, color: "var(--ink)" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Tools"
        title="Gap analysis"
        sub="Where the knowledge base is thin, so drafted answers there will have low confidence."
        actions={
          canEdit && (
            <Link href="/knowledge/interview" className="btn btn-primary btn-sm">
              Fill gaps with the AI interview
            </Link>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-[18px]">
            <div className="eyebrow">{s.label}</div>
            <b className="mt-1 block text-2xl font-bold tracking-tight" style={{ color: s.color }}>
              {s.value}
            </b>
          </div>
        ))}
      </div>

      {data.recommendations.length > 0 && (
        <section className="flag-note mb-4 flex-col !gap-1.5">
          <b>Recommendations</b>
          <ul className="grid list-disc gap-1 pl-5">
            {data.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card mb-4 p-[18px]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="!text-base">Coverage by domain</h2>
          <span className="text-xs text-ink-65">entries · confidence of drafted answers</span>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {data.domains.map((d) => {
            const c = COVERAGE[d.coverage];
            return (
              <div
                key={d.domain}
                className="rounded-2xl border border-g-line bg-g-bg p-3"
                title={`${d.label}: ${plural(d.entries, "entry", "entries")}, ${d.verified} verified, drafts ${conf(d.confidence)}, ${plural(d.questionsAsked, "question")} asked`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold">{d.label}</span>
                  <span className={`badge ${c.badge}`}>{d.coverage}</span>
                </div>
                <span className="track block">
                  <span style={{ width: `${Math.min(100, (d.entries / maxEntries) * 100)}%`, background: c.bar }} />
                </span>
                <div className="mt-1.5 flex justify-between text-xs text-ink-65">
                  <span>{plural(d.entries, "entry", "entries")}</span>
                  <span className="font-mono">{conf(d.confidence)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {data.gaps.length > 0 && (
        <section className="card overflow-x-auto p-[18px]">
          <h2 className="mb-2 !text-base">Largest gaps</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th className="!pl-0">Domain</th>
                <th>Entries</th>
                <th className="hidden sm:table-cell">Verified</th>
                <th className="hidden sm:table-cell">Confidence</th>
                <th className="hidden md:table-cell">Asked</th>
                <th>Gap score</th>
              </tr>
            </thead>
            <tbody>
              {data.gaps.map((g) => (
                <tr key={g.domain}>
                  <td className="!pl-0 font-semibold">{g.label}</td>
                  <td className="font-mono">{g.entries}</td>
                  <td className="hidden font-mono sm:table-cell">{g.verified}</td>
                  <td className="hidden font-mono sm:table-cell">{conf(g.confidence)}</td>
                  <td className="hidden font-mono md:table-cell">{g.questionsAsked}</td>
                  <td>
                    <span className={`badge ${g.gapScore >= 70 ? "b-red" : g.gapScore >= 50 ? "b-amber" : "b-blue"}`}>
                      {g.gapScore}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
