import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  CircleAlert,
  FileText,
  Search,
  Table2,
  Upload,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { getDashboardData, COVERED_MIN_ENTRIES } from "@/lib/dashboard";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import {
  domainLabel,
  pct,
  questionnaireStatus,
} from "@/lib/ui/labels";

export const dynamic = "force-dynamic";

function Tile({
  title,
  chip,
  children,
  className = "",
}: {
  title: string;
  chip?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card min-w-0 p-[18px] ${className}`}>
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <h2 className="!text-base">{title}</h2>
        {chip && <span className="text-xs text-ink-65">{chip}</span>}
      </div>
      {children}
    </section>
  );
}

function Stat({
  icon,
  color,
  value,
  label,
}: {
  icon: React.ReactNode;
  color: string;
  value: number;
  label: string;
}) {
  return (
    <div className="card flex items-center gap-3 p-[18px]">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-g-line bg-g-bg [&_svg]:h-[18px] [&_svg]:w-[18px]"
        style={{ color }}
        aria-hidden
      >
        {icon}
      </span>
      <div>
        <b className="block text-xl leading-tight font-bold tracking-tight">
          {value}
        </b>
        <small className="text-xs text-ink-65">{label}</small>
      </div>
    </div>
  );
}

function CoverageDonut({ covered, total }: { covered: number; total: number }) {
  const r = 58;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? covered / total : 0;
  return (
    <svg
      width="150"
      height="150"
      viewBox="0 0 150 150"
      className="shrink-0"
      role="img"
      aria-label={`Knowledge base covers ${covered} of ${total} domains`}
    >
      <circle cx="75" cy="75" r={r} fill="none" stroke="var(--track)" strokeWidth="16" />
      {share > 0 && (
        <circle
          cx="75"
          cy="75"
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - share)}
          transform="rotate(-90 75 75)"
        />
      )}
      <text x="75" y="76" textAnchor="middle" fontWeight="700" fontSize="28" fill="var(--ink)">
        {Math.round(share * 100)}%
      </text>
      <text x="75" y="96" textAnchor="middle" fontSize="11" fill="var(--ink-45)">
        {covered} / {total} domains
      </text>
    </svg>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const d = await getDashboardData(session.user.organizationId);

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const thin = [...d.kb.perDomain].sort((a, b) => a.count - b.count).slice(0, 4);
  const strong = [...d.kb.perDomain]
    .sort((a, b) => b.count - a.count)
    .filter((x) => x.count > 0 && !thin.includes(x))
    .slice(0, 2);
  const gapRows = [...thin, ...strong];
  const maxDomain = Math.max(1, ...d.kb.perDomain.map((x) => x.count));
  const thinCount = d.kb.totalDomains - d.kb.coveredDomains;
  const firstAwaiting = d.awaiting[0];

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="eyebrow mb-1">
            {today}
            {d.organizationName && <> · {d.organizationName}</>}
          </div>
          <h1 className="sm:!text-[28px]">Dashboard</h1>
        </div>
        <form action="/knowledge" method="get" role="search" className="relative sm:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-45"
            aria-hidden
          />
          <input
            type="search"
            name="search"
            className="input input-glass !h-[38px] !rounded-full !pl-10"
            placeholder="Search knowledge base…"
            aria-label="Search knowledge base"
          />
        </form>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_.75fr_1.1fr]">
        <Tile title="Questionnaire progress" chip="% approved" className="lg:col-span-1">
          {d.questionnaires.length === 0 ? (
            <div className="grid h-[180px] place-items-center text-center text-[13px] text-ink-65">
              <div>
                No questionnaires yet.
                <div className="mt-3 flex justify-center gap-2">
                  <Link href="/questionnaires/upload" className="btn btn-primary btn-sm">
                    Upload
                  </Link>
                  <Link href="/templates" className="btn btn-ghost btn-sm">
                    Use a template
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-[180px] items-stretch gap-2.5">
              {d.questionnaires.map((q) => {
                const p = pct(q.approvedCount, q.totalQuestions);
                const full = p === 100;
                return (
                  <Link
                    key={q.id}
                    href={`/questionnaires/${q.id}`}
                    className="flex min-w-0 flex-1 flex-col items-center gap-2"
                    title={`${q.name}: ${q.approvedCount} of ${q.totalQuestions} approved`}
                  >
                    <span className="relative w-full flex-1 overflow-hidden rounded-full bg-track">
                      <span
                        className="absolute inset-x-0 bottom-0 rounded-full"
                        style={{
                          height: `${p}%`,
                          background: full
                            ? "linear-gradient(180deg,#5eead4,#0d9488)"
                            : "linear-gradient(180deg,#60a5fa,#2563eb)",
                        }}
                      />
                      <span
                        className="absolute inset-x-0 text-center text-[10.5px] font-semibold"
                        style={
                          p >= 85
                            ? { top: 8, color: "#fff" }
                            : { bottom: `calc(${p}% + 6px)`, color: "var(--ink-65)" }
                        }
                      >
                        {p}%
                      </span>
                    </span>
                    <small className="w-full truncate text-center text-[11px] text-ink-65">
                      {q.template ?? q.name}
                    </small>
                  </Link>
                );
              })}
            </div>
          )}
        </Tile>

        <div className="grid gap-3">
          <Stat
            icon={<FileText />}
            color="var(--accent)"
            value={d.answers.total}
            label="Answers drafted"
          />
          <Stat
            icon={<CircleAlert />}
            color="var(--amber)"
            value={d.answers.awaiting}
            label="Awaiting review"
          />
          <Stat
            icon={<BookOpen />}
            color="var(--teal)"
            value={d.kb.total}
            label="Knowledge base entries"
          />
        </div>

        <Tile title="KB coverage" chip={`${d.kb.totalDomains} domains`}>
          <div className="flex flex-col items-center gap-[18px] sm:flex-row">
            <CoverageDonut covered={d.kb.coveredDomains} total={d.kb.totalDomains} />
            <dl className="grid w-full flex-1 gap-3 text-xs text-ink-65">
              <div className="flex items-baseline justify-between">
                <dt>
                  <span className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full bg-accent" />
                  Entries
                  <b className="block text-[17px] text-ink">{d.kb.total}</b>
                </dt>
                <dd className="text-[11.5px] font-semibold text-teal">
                  +{d.kb.addedThisWeek} this week
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt>
                  <span className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full bg-teal" />
                  Verified
                  <b className="block text-[17px] text-ink">{d.kb.verified}</b>
                </dt>
                <dd className="text-[11.5px] font-semibold text-teal">
                  {pct(d.kb.verified, d.kb.total)}%
                </dd>
              </div>
              <div className="flex items-baseline justify-between">
                <dt>
                  <span className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full bg-amber" />
                  Thin domains
                  <b className="block text-[17px] text-ink">{thinCount}</b>
                </dt>
                <dd className="text-[11.5px] font-semibold text-amber">
                  &lt; {COVERED_MIN_ENTRIES} entries
                </dd>
              </div>
            </dl>
          </div>
        </Tile>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Tile
          title="Awaiting review"
          chip={
            firstAwaiting ? (
              <Link
                href={`/questionnaires/${firstAwaiting.questionnaireId}`}
                className="font-semibold text-accent"
              >
                Open review
              </Link>
            ) : undefined
          }
        >
          {d.awaiting.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-65">
              Nothing to review. Drafted answers that need a decision show up
              here, lowest confidence first.
            </p>
          ) : (
            <ul>
              {d.awaiting.map((a, i) => (
                <li key={a.answerId} className={i ? "border-t border-line-2" : ""}>
                  <Link
                    href={`/questionnaires/${a.questionnaireId}?q=${a.rowIndex}`}
                    className="flex items-center gap-3.5 py-3"
                  >
                    <ConfidenceRing confidence={a.confidence} threshold={d.threshold} />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[13.5px] font-semibold">
                        <span className="font-mono font-medium text-ink-65">
                          #{a.rowIndex}
                        </span>{" "}
                        {a.questionText}
                      </b>
                      <small className="block truncate text-xs text-ink-65">
                        {a.questionnaireName} · {domainLabel(a.domain)} · confidence{" "}
                        {a.confidence.toFixed(2)}
                      </small>
                    </span>
                    <span className="flex items-center gap-3 text-xs text-ink-65">
                      <span className="hidden sm:inline">
                        {a.sourceCount} {a.sourceCount === 1 ? "source" : "sources"}
                      </span>
                      <span className={`pill ${a.status === "FLAGGED" ? "p-flag" : "p-pend"}`}>
                        {a.status === "FLAGGED" ? "Flagged" : "Pending"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        <Tile
          title="Gap analysis"
          chip={
            <Link href="/knowledge/gap-analysis" className="font-semibold text-accent">
              entries per domain
            </Link>
          }
        >
          <ul>
            {gapRows.map((g, i) => {
              const weak = g.count < COVERED_MIN_ENTRIES;
              return (
                <li
                  key={g.domain}
                  className={`flex items-center gap-2 py-2.5 text-[13px] ${i ? "border-t border-line-2" : "pt-0"}`}
                >
                  <span className="w-[130px] shrink-0 truncate sm:w-[150px]">
                    {domainLabel(g.domain)}
                  </span>
                  <span className="track mx-1.5 flex-1">
                    <span
                      style={{
                        width: `${Math.max(g.count ? 4 : 0, (g.count / maxDomain) * 100)}%`,
                        background: weak ? "var(--amber)" : undefined,
                      }}
                    />
                  </span>
                  <b>{g.count}</b>
                </li>
              );
            })}
          </ul>
        </Tile>
      </div>

      <Tile
        title="Recent questionnaires"
        className="mt-4"
        chip={
          <Link href="/questionnaires" className="font-semibold text-accent">
            All questionnaires ({d.questionnaireCount})
          </Link>
        }
      >
        {d.questionnaires.length === 0 ? (
          <div className="py-6 text-center text-[13px] text-ink-65">
            Upload a CSV or Excel questionnaire, or start one from a template.
            <div className="mt-3 flex justify-center gap-2">
              <Link href="/questionnaires/upload" className="btn btn-primary btn-sm">
                <Upload className="h-3.5 w-3.5" aria-hidden /> Upload
              </Link>
              <Link href="/templates" className="btn btn-ghost btn-sm">
                <Table2 className="h-3.5 w-3.5" aria-hidden /> Templates
              </Link>
            </div>
          </div>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="!pl-1">Questionnaire</th>
                  <th className="hidden sm:table-cell">Template</th>
                  <th className="hidden sm:table-cell">Approved</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.questionnaires.map((q) => {
                  const s = questionnaireStatus(q.status);
                  const p = pct(q.approvedCount, q.totalQuestions);
                  return (
                    <tr key={q.id}>
                      <td className="max-w-[260px] !pl-1">
                        <Link href={`/questionnaires/${q.id}`} className="block truncate font-semibold hover:text-accent">
                          {q.name}
                        </Link>
                        <div className="truncate font-mono text-[11.5px] text-ink-45">
                          {q.fileName ?? `${q.totalQuestions} questions`}
                        </div>
                      </td>
                      <td className="hidden sm:table-cell">{q.template ?? "Upload"}</td>
                      <td className="hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <span className="track w-[110px]">
                            <span style={{ width: `${p}%`, background: "var(--teal)" }} />
                          </span>
                          <span className="font-mono text-xs">
                            {q.approvedCount}/{q.totalQuestions}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${s.tone}`}>{s.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tile>

      {firstAwaiting && (
        <div className="cta mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative z-[1]">
            <h3 className="text-xl font-bold">
              {d.answers.awaiting} {d.answers.awaiting === 1 ? "answer" : "answers"} waiting for review
            </h3>
            <p className="mt-0.5 text-[13px] opacity-85">
              {d.answers.flagged} flagged below the {d.threshold.toFixed(2)} confidence
              threshold.
            </p>
          </div>
          <Link
            href={`/questionnaires/${firstAwaiting.questionnaireId}?q=${firstAwaiting.rowIndex}`}
            className="btn relative z-[1] !bg-white !text-[#1e40af]"
          >
            Review answers
          </Link>
        </div>
      )}
    </>
  );
}
