"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Shield,
  BookOpen,
  FileText,
  CheckCircle,
  Upload,
  MessageSquare,
  Activity,
  ChevronRight,
  Brain,
  Database,
  BarChart3,
  Clock,
  FileCheck,
  Layers,
} from "lucide-react";

interface KBStats {
  totalEntries: number;
  verifiedEntries: number;
  coveredDomains: number;
  totalDomains: number;
  coveragePercent: number;
}

interface QuestionnaireItem {
  id: string;
  name: string;
  status: string;
  totalQuestions: number;
  answeredCount: number;
  approvedCount: number;
  rejectedCount: number;
  createdAt: string;
  updatedAt: string;
}

interface DashboardData {
  kbStats: KBStats;
  questionnaires: QuestionnaireItem[];
  totalQuestionnaires: number;
  totalAnswered: number;
  totalApproved: number;
  totalPending: number;
  activeQuestionnaires: number;
}

const Q_STATUS: Record<
  string,
  { bg: string; text: string; border: string; label: string; pulse?: boolean }
> = {
  UPLOADED: {
    bg: "rgba(107, 114, 128, 0.1)",
    text: "#9ca3af",
    border: "rgba(107, 114, 128, 0.3)",
    label: "Uploaded",
  },
  PARSING: {
    bg: "rgba(167, 139, 250, 0.1)",
    text: "#a78bfa",
    border: "rgba(167, 139, 250, 0.3)",
    label: "Parsing",
    pulse: true,
  },
  PARSED: {
    bg: "rgba(59, 130, 246, 0.1)",
    text: "#3b82f6",
    border: "rgba(59, 130, 246, 0.3)",
    label: "Parsed",
  },
  GENERATING: {
    bg: "rgba(245, 158, 11, 0.1)",
    text: "#f59e0b",
    border: "rgba(245, 158, 11, 0.3)",
    label: "Generating",
    pulse: true,
  },
  IN_REVIEW: {
    bg: "rgba(201, 162, 39, 0.1)",
    text: "#c9a227",
    border: "rgba(201, 162, 39, 0.3)",
    label: "In Review",
    pulse: true,
  },
  COMPLETED: {
    bg: "rgba(16, 185, 129, 0.1)",
    text: "#10b981",
    border: "rgba(16, 185, 129, 0.3)",
    label: "Completed",
  },
  EXPORTED: {
    bg: "rgba(6, 182, 212, 0.1)",
    text: "#06b6d4",
    border: "rgba(6, 182, 212, 0.3)",
    label: "Exported",
  },
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [kbRes, qRes] = await Promise.allSettled([
          fetch("/api/knowledge/stats"),
          fetch("/api/questionnaires?limit=50"),
        ]);

        const kbStats: KBStats =
          kbRes.status === "fulfilled" && kbRes.value.ok
            ? await kbRes.value.json()
            : {
                totalEntries: 0,
                verifiedEntries: 0,
                coveredDomains: 0,
                totalDomains: 20,
                coveragePercent: 0,
              };

        const qData =
          qRes.status === "fulfilled" && qRes.value.ok
            ? await qRes.value.json()
            : { questionnaires: [], total: 0 };

        const questionnaires: QuestionnaireItem[] = qData.questionnaires || [];
        const totalQuestionnaires = qData.total || 0;

        const totalAnswered = questionnaires.reduce(
          (sum: number, q: QuestionnaireItem) => sum + q.answeredCount,
          0,
        );
        const totalApproved = questionnaires.reduce(
          (sum: number, q: QuestionnaireItem) => sum + q.approvedCount,
          0,
        );
        const totalPending =
          totalAnswered -
          totalApproved -
          questionnaires.reduce(
            (sum: number, q: QuestionnaireItem) => sum + q.rejectedCount,
            0,
          );
        const activeQuestionnaires = questionnaires.filter(
          (q: QuestionnaireItem) =>
            !["COMPLETED", "EXPORTED"].includes(q.status),
        ).length;

        setData({
          kbStats,
          questionnaires: questionnaires.slice(0, 8),
          totalQuestionnaires,
          totalAnswered,
          totalApproved,
          totalPending: Math.max(0, totalPending),
          activeQuestionnaires,
        });
      } catch {
        setData({
          kbStats: {
            totalEntries: 0,
            verifiedEntries: 0,
            coveredDomains: 0,
            totalDomains: 20,
            coveragePercent: 0,
          },
          questionnaires: [],
          totalQuestionnaires: 0,
          totalAnswered: 0,
          totalApproved: 0,
          totalPending: 0,
          activeQuestionnaires: 0,
        });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="skeleton h-40 rounded-2xl" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 skeleton h-72 rounded-2xl" />
          <div className="lg:col-span-4 skeleton h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const d = data!;
  const firstName = session?.user?.name?.split(" ")[0] || "Admin";

  return (
    <div className="space-y-8">
      {/* ===== Hero Header ===== */}
      <div className="card-luxury !p-0 overflow-hidden">
        <div className="relative px-8 pt-8 pb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-[#c9a227]/[0.04] to-[#a78bfa]/[0.04]" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#c9a227] to-[#a78bfa] flex items-center justify-center shadow-lg shadow-[#c9a227]/20">
                <Shield className="w-7 h-7 text-black" />
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight">
                  Welcome, <span className="text-[#c9a227]">{firstName}</span>
                </h1>
                <p className="text-sm text-white/35 mt-1 flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5" />
                  CompliBot -- AI Security Questionnaire Responder
                </p>
              </div>
            </div>

            {/* Status pills */}
            <div className="hidden lg:flex items-center gap-3">
              <StatusPill
                count={d.activeQuestionnaires}
                label="Active"
                color="#a78bfa"
              />
              {d.totalPending > 0 && (
                <StatusPill
                  count={d.totalPending}
                  label="Pending"
                  color="#f59e0b"
                />
              )}
              <StatusPill
                count={d.totalApproved}
                label="Approved"
                color="#10b981"
              />
              <div className="flex gap-2 ml-2">
                <Link
                  href="/questionnaires/upload"
                  className="btn-primary !py-2 !px-4 flex items-center gap-1.5 text-xs"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/[0.04] border-t border-white/[0.06]">
          <StatCell
            icon={<FileText className="w-4 h-4" />}
            label="Questionnaires"
            value={`${d.totalQuestionnaires}`}
            color="#3b82f6"
          />
          <StatCell
            icon={<Database className="w-4 h-4" />}
            label="KB Entries"
            value={`${d.kbStats.totalEntries}`}
            sub={`${d.kbStats.verifiedEntries} verified`}
            color="#a78bfa"
          />
          <StatCell
            icon={<CheckCircle className="w-4 h-4" />}
            label="Approved"
            value={`${d.totalApproved}`}
            sub="answers"
            color="#10b981"
          />
          <StatCell
            icon={<BarChart3 className="w-4 h-4" />}
            label="Coverage"
            value={`${d.kbStats.coveragePercent}%`}
            sub={`${d.kbStats.coveredDomains}/${d.kbStats.totalDomains}`}
            color={d.kbStats.coveragePercent >= 50 ? "#10b981" : "#f59e0b"}
          />
        </div>
      </div>

      {/* ===== Main Grid ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Questionnaires */}
        <div className="lg:col-span-8 card-luxury !p-0 overflow-hidden">
          <div className="px-6 py-5 border-b border-white/[0.06] bg-white/[0.02] flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(167, 139, 250, 0.15)" }}
              >
                <Layers className="w-4 h-4 text-[#a78bfa]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white/80">
                  Recent Questionnaires
                </h3>
                <p className="text-[10px] font-bold text-white/30 uppercase tracking-wider mt-0.5">
                  Sorted by date
                </p>
              </div>
            </div>
            <Link
              href="/questionnaires"
              className="text-xs font-bold text-white/40 uppercase tracking-wide hover:text-[#c9a227] transition-colors flex items-center gap-1"
            >
              View All <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {d.questionnaires.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="w-12 h-12 text-white/10 mx-auto mb-4" />
              <p className="text-white/50 text-sm font-bold">
                No questionnaires yet
              </p>
              <p className="text-white/25 text-xs mt-1">
                Upload your first vendor security questionnaire
              </p>
              <div className="flex justify-center gap-3 mt-6">
                <Link
                  href="/questionnaires/upload"
                  className="btn-primary flex items-center gap-2 text-xs"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload Questionnaire
                </Link>
                <Link
                  href="/knowledge/upload"
                  className="btn-secondary flex items-center gap-2 text-xs"
                >
                  <BookOpen className="w-3.5 h-3.5" /> Add Knowledge
                </Link>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {d.questionnaires.map((q) => {
                const status = Q_STATUS[q.status] || Q_STATUS.UPLOADED;
                const progress =
                  q.totalQuestions > 0
                    ? Math.round((q.approvedCount / q.totalQuestions) * 100)
                    : 0;
                return (
                  <Link
                    key={q.id}
                    href={`/questionnaires/${q.id}`}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.02] transition-all duration-200 group"
                  >
                    {/* Progress indicator bar */}
                    <div className="w-1.5 h-8 rounded-full shrink-0 overflow-hidden bg-white/[0.06]">
                      <div
                        className="w-full rounded-full transition-all duration-500"
                        style={{
                          height: `${Math.max(progress, 5)}%`,
                          background: progress === 100 ? "#10b981" : "#a78bfa",
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white/80 group-hover:text-[#c9a227] transition-colors truncate">
                        {q.name}
                      </p>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-white/30 flex items-center gap-1">
                          <FileCheck className="w-3 h-3" />
                          {q.approvedCount}/{q.totalQuestions} approved
                        </span>
                        <span className="flex items-center gap-1 text-xs text-white/30">
                          <Clock className="w-3 h-3" />
                          {new Date(q.updatedAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </div>
                    </div>
                    {/* Status badge with pulse */}
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0"
                      style={{
                        background: status.bg,
                        color: status.text,
                        borderColor: status.border,
                      }}
                    >
                      <span className="relative flex items-center justify-center">
                        <span
                          className="inline-block w-1.5 h-1.5 rounded-full"
                          style={{ background: status.text }}
                        />
                        {status.pulse && (
                          <span
                            className="absolute inline-block w-1.5 h-1.5 rounded-full animate-ping opacity-40"
                            style={{ background: status.text }}
                          />
                        )}
                      </span>
                      {status.label}
                    </span>
                    <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-[#c9a227] transition-colors shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Access */}
          <div className="card-luxury">
            <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-4">
              Quick Access
            </h3>
            <div className="space-y-2">
              {[
                {
                  href: "/questionnaires/upload",
                  label: "Upload Questionnaire",
                  icon: <Upload className="w-4 h-4" />,
                  from: "#c9a227",
                  to: "#b8911f",
                },
                {
                  href: "/knowledge",
                  label: "Knowledge Base",
                  icon: <BookOpen className="w-4 h-4" />,
                  from: "#a78bfa",
                  to: "#7c3aed",
                },
                {
                  href: "/knowledge/upload",
                  label: "Add Documents",
                  icon: <FileText className="w-4 h-4" />,
                  from: "#3b82f6",
                  to: "#2563eb",
                },
                {
                  href: "/knowledge/interview",
                  label: "AI Interview",
                  icon: <MessageSquare className="w-4 h-4" />,
                  from: "#10b981",
                  to: "#059669",
                },
                {
                  href: "/questionnaires",
                  label: "All Questionnaires",
                  icon: <Layers className="w-4 h-4" />,
                  from: "#06b6d4",
                  to: "#0891b2",
                },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/15 transition-all duration-200 group"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                    style={{
                      background: `linear-gradient(135deg, ${item.from}, ${item.to})`,
                    }}
                  >
                    {item.icon}
                  </div>
                  <span className="text-sm font-semibold text-white/60 group-hover:text-white transition-colors">
                    {item.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/15 ml-auto group-hover:text-white/40 transition-colors" />
                </Link>
              ))}
            </div>
          </div>

          {/* Knowledge Base Summary */}
          <div className="card-luxury !p-0 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.06] bg-white/[0.02] flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(201, 162, 39, 0.15)" }}
              >
                <Brain className="w-4 h-4 text-[#c9a227]" />
              </div>
              <h3 className="text-sm font-bold text-white/80">
                Knowledge Base
              </h3>
            </div>
            <div className="p-5 space-y-4">
              {d.kbStats.totalEntries === 0 ? (
                <div className="text-center py-6">
                  <Database className="w-8 h-8 text-white/10 mx-auto mb-2" />
                  <p className="text-xs text-white/30">
                    No knowledge entries yet
                  </p>
                  <p className="text-[10px] text-white/20 mt-1">
                    Upload documents or run an AI interview
                  </p>
                </div>
              ) : (
                <>
                  {/* Coverage bar */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                        Domain Coverage
                      </span>
                      <span className="text-sm font-extrabold text-[#c9a227] tabular-nums">
                        {d.kbStats.coveragePercent}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${d.kbStats.coveragePercent}%`,
                          background:
                            "linear-gradient(90deg, #c9a227, #a78bfa)",
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-white/25 mt-1.5">
                      {d.kbStats.coveredDomains} of {d.kbStats.totalDomains}{" "}
                      security domains covered
                    </p>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                      <div className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
                        Total Entries
                      </div>
                      <div className="text-lg font-extrabold text-[#3b82f6] tabular-nums mt-0.5">
                        {d.kbStats.totalEntries}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                      <div className="text-[10px] font-bold text-white/30 uppercase tracking-wider">
                        Verified
                      </div>
                      <div className="text-lg font-extrabold text-[#10b981] tabular-nums mt-0.5">
                        {d.kbStats.verifiedEntries}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Action links */}
              <div className="space-y-1 pt-2 border-t border-white/[0.06]">
                {[
                  {
                    href: "/knowledge/upload",
                    label: "Upload document",
                    icon: Upload,
                    color: "#a78bfa",
                  },
                  {
                    href: "/knowledge/interview",
                    label: "Start AI interview",
                    icon: MessageSquare,
                    color: "#10b981",
                  },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-white/[0.02] transition-colors group"
                  >
                    <div className="relative mt-1.5 shrink-0">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: item.color }}
                      />
                      <div
                        className="w-2 h-2 rounded-full absolute inset-0 animate-ping opacity-30"
                        style={{ background: item.color }}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs text-white/60 font-medium group-hover:text-white transition-colors">
                        {item.label}
                      </p>
                      <p className="text-[10px] text-white/25 mt-0.5">
                        Build your knowledge base
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  count,
  label,
  color,
}: {
  count: number;
  label: string;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2 rounded-full border"
      style={{ background: `${color}08`, borderColor: `${color}20` }}
    >
      <span className="text-xl font-extrabold tabular-nums" style={{ color }}>
        {count}
      </span>
      <span
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: `${color}99` }}
      >
        {label}
      </span>
    </div>
  );
}

function StatCell({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-[#0a1628] px-6 py-4 flex items-center gap-4">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: `${color}15`, color }}
      >
        {icon}
      </div>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-white/30">
          {label}
        </div>
        <div className="flex items-baseline gap-1">
          <span
            className="text-xl font-extrabold tabular-nums"
            style={{ color }}
          >
            {value}
          </span>
          {sub && <span className="text-xs text-white/30">{sub}</span>}
        </div>
      </div>
    </div>
  );
}
