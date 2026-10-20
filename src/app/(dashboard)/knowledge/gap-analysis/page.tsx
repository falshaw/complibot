"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  BarChart3,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

interface DomainAnalysis {
  domain: string;
  label: string;
  entries: number;
  verified: number;
  confidence: number;
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

const COVERAGE_COLORS = {
  strong: "bg-emerald-500",
  adequate: "bg-blue-500",
  weak: "bg-amber-500",
  none: "bg-slate-700",
};

const COVERAGE_TEXT = {
  strong: "text-emerald-400",
  adequate: "text-blue-400",
  weak: "text-amber-400",
  none: "text-slate-500",
};

export default function GapAnalysisPage() {
  const [data, setData] = useState<GapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/knowledge/gap-analysis")
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="text-slate-400 text-center py-20">
        Analyzing knowledge gaps...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-red-400 text-center py-20">
        Failed to load gap analysis
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Knowledge Gap Analysis
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Identify weak areas in your knowledge base to improve answer quality
          </p>
        </div>
        <Link
          href="/knowledge/interview"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
        >
          Fill Gaps <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="card-panel text-center">
          <div className="text-3xl font-bold text-white mb-1">
            {data.overallScore}%
          </div>
          <div className="text-xs text-slate-400">Overall Coverage</div>
        </div>
        <div className="card-panel text-center">
          <div className="text-3xl font-bold text-emerald-400 mb-1">
            {data.summary.strong}
          </div>
          <div className="text-xs text-slate-400">Strong Domains</div>
        </div>
        <div className="card-panel text-center">
          <div className="text-3xl font-bold text-amber-400 mb-1">
            {data.summary.weak + data.summary.none}
          </div>
          <div className="text-xs text-slate-400">Gaps Found</div>
        </div>
        <div className="card-panel text-center">
          <div className="text-3xl font-bold text-white mb-1">
            {data.totalEntries}
          </div>
          <div className="text-xs text-slate-400">Total KB Entries</div>
        </div>
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="card-panel mb-6">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Recommendations
          </h3>
          <ul className="space-y-2">
            {data.recommendations.map((rec, i) => (
              <li
                key={i}
                className="text-sm text-slate-300 flex items-start gap-2"
              >
                <span className="text-amber-400 mt-0.5">•</span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Domain Heatmap */}
      <div className="card-panel mb-6">
        <h3 className="text-sm font-semibold text-white mb-4">
          Domain Coverage Heatmap
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {data.domains.map((d) => (
            <div
              key={d.domain}
              className="rounded-lg border border-slate-700 p-3"
              title={`${d.label}: ${d.entries} entries, ${d.confidence}% avg confidence, ${d.questionsAsked} questions asked`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-300 truncate">
                  {d.label}
                </span>
                {d.coverage === "strong" && (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 mb-1">
                <div
                  className={`h-2 rounded-full ${COVERAGE_COLORS[d.coverage]}`}
                  style={{
                    width: `${Math.min(100, (d.entries / 5) * 100)}%`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs ${COVERAGE_TEXT[d.coverage]}`}>
                  {d.entries} entries
                </span>
                <span className="text-xs text-slate-500">{d.confidence}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Gap Details Table */}
      {data.gaps.length > 0 && (
        <div className="card-panel">
          <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-400" />
            Gap Details (Score &gt; 30)
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400">
                <th className="text-left py-2 font-medium">Domain</th>
                <th className="text-center py-2 font-medium">Entries</th>
                <th className="text-center py-2 font-medium">Verified</th>
                <th className="text-center py-2 font-medium">Confidence</th>
                <th className="text-center py-2 font-medium">
                  Questions Asked
                </th>
                <th className="text-center py-2 font-medium">Gap Score</th>
              </tr>
            </thead>
            <tbody>
              {data.gaps.map((g) => (
                <tr
                  key={g.domain}
                  className="border-b border-slate-800 hover:bg-slate-800/50"
                >
                  <td className="py-2 text-white">{g.label}</td>
                  <td className="py-2 text-center text-slate-300">
                    {g.entries}
                  </td>
                  <td className="py-2 text-center text-slate-300">
                    {g.verified}
                  </td>
                  <td className="py-2 text-center text-slate-300">
                    {g.confidence}%
                  </td>
                  <td className="py-2 text-center text-slate-300">
                    {g.questionsAsked}
                  </td>
                  <td className="py-2 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        g.gapScore >= 70
                          ? "bg-red-500/15 text-red-400"
                          : g.gapScore >= 50
                            ? "bg-amber-500/15 text-amber-400"
                            : "bg-blue-500/15 text-blue-400"
                      }`}
                    >
                      {g.gapScore}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
