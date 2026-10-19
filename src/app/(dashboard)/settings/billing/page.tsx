"use client";

import { useState, useEffect } from "react";
import { CreditCard, ExternalLink, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import {
  isUnlimited,
  usagePercent,
  usageState,
  formatLimit,
} from "@/lib/usage-display";

interface UsageMetric {
  current: number;
  limit: number;
  label: string;
}

interface UsageSummary {
  plan: "FREE" | "PRO" | "ENTERPRISE";
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  usage: Record<string, UsageMetric>;
  exportFormats: string[];
}

const PLAN_NAME: Record<string, string> = {
  FREE: "Free",
  PRO: "Pro",
  ENTERPRISE: "Enterprise",
};

const BAR_COLOR: Record<string, string> = {
  ok: "bg-indigo-500",
  warn: "bg-amber-500",
  limit: "bg-red-500",
  unlimited: "bg-emerald-500",
};

export default function BillingPage() {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  useEffect(() => {
    async function loadUsage() {
      try {
        const res = await fetch("/api/billing/usage");
        if (!res.ok) throw new Error("Failed to load usage");
        setSummary(await res.json());
      } catch {
        setSummary(null);
      } finally {
        setLoadingUsage(false);
      }
    }
    loadUsage();
  }, []);

  async function handleManageBilling() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (!res.ok) throw new Error("Failed to open billing portal");
      const data = await res.json();
      window.location.href = data.url;
    } catch {
      toast.error("Billing portal not available yet");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpgrade(plan: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error("Failed to start checkout");
      const data = await res.json();
      window.location.href = data.url;
    } catch {
      toast.error("Checkout not available yet");
    } finally {
      setLoading(false);
    }
  }

  const metrics = summary ? Object.entries(summary.usage) : [];
  const nearLimit = metrics.some(
    ([, m]) => usageState(m.current, m.limit) !== "ok" && !isUnlimited(m.limit),
  );
  const plan = summary?.plan ?? "FREE";
  const renewal = summary?.subscription?.currentPeriodEnd
    ? new Date(summary.subscription.currentPeriodEnd).toLocaleDateString()
    : null;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Billing</h1>

      {/* Approaching-limit upgrade prompt */}
      {nearLimit && plan !== "ENTERPRISE" && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
          <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-amber-200 font-medium">
              You&apos;re approaching a plan limit
            </p>
            <p className="text-sm text-amber-200/80">
              Upgrade to keep generating answers without interruption.
            </p>
          </div>
        </div>
      )}

      {/* Current plan */}
      <div className="card-panel mb-6">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">Current Plan</h2>
        </div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white text-xl font-bold">{PLAN_NAME[plan]}</p>
            {summary?.subscription && (
              <p className="text-sm text-slate-400">
                {summary.subscription.status}
                {renewal &&
                  ` · ${
                    summary.subscription.cancelAtPeriodEnd ? "ends" : "renews"
                  } ${renewal}`}
              </p>
            )}
          </div>
          <button
            onClick={handleManageBilling}
            disabled={loading}
            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            <ExternalLink className="w-4 h-4" /> Manage Billing
          </button>
        </div>
      </div>

      {/* Usage this period */}
      <div className="card-panel mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Usage this period
        </h2>
        {loadingUsage ? (
          <p className="text-slate-400 text-sm">Loading usage…</p>
        ) : metrics.length === 0 ? (
          <p className="text-slate-400 text-sm">Usage data unavailable.</p>
        ) : (
          <div className="space-y-4">
            {metrics.map(([key, m]) => {
              const state = usageState(m.current, m.limit);
              const pct = usagePercent(m.current, m.limit);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-slate-300">{m.label}</span>
                    <span
                      className={
                        state === "limit"
                          ? "text-red-400"
                          : state === "warn"
                            ? "text-amber-400"
                            : "text-slate-400"
                      }
                    >
                      {m.current} / {formatLimit(m.limit)}
                    </span>
                  </div>
                  {isUnlimited(m.limit) ? (
                    <div className="flex items-center gap-1 text-xs text-emerald-400">
                      <Check className="w-3.5 h-3.5" /> Unlimited
                    </div>
                  ) : (
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full ${BAR_COLOR[state]} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {summary && (
          <p className="text-xs text-slate-500 mt-4">
            Export formats: {summary.exportFormats.join(", ").toUpperCase()}
          </p>
        )}
      </div>

      {/* Upgrade */}
      {plan !== "ENTERPRISE" && (
        <div className="card-panel">
          <h2 className="text-lg font-semibold text-white mb-4">Upgrade</h2>
          <div className="space-y-3">
            {plan === "FREE" && (
              <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <div>
                  <p className="text-white font-medium">Pro — $99/mo</p>
                  <p className="text-sm text-slate-400">
                    Unlimited questionnaires &amp; AI generations, 1,000 KB
                    entries, 10 seats
                  </p>
                </div>
                <button
                  onClick={() => handleUpgrade("pro")}
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  Upgrade
                </button>
              </div>
            )}
            <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700">
              <div>
                <p className="text-white font-medium">Enterprise — $299/mo</p>
                <p className="text-sm text-slate-400">
                  Unlimited everything, SSO, API access, PDF export
                </p>
              </div>
              <button
                onClick={() => handleUpgrade("enterprise")}
                disabled={loading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
              >
                Upgrade
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
