"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Building2, Users, SlidersHorizontal } from "lucide-react";

interface OrgData {
  id: string;
  name: string;
  confidenceThreshold: number;
  knowledgeEntryCount: number;
  questionnaireCount: number;
}

export default function SettingsPage() {
  const { data: session } = useSession();
  const [org, setOrg] = useState<OrgData | null>(null);
  const [orgName, setOrgName] = useState("");
  const [threshold, setThreshold] = useState(0.8);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingThreshold, setSavingThreshold] = useState(false);

  useEffect(() => {
    fetch("/api/organizations")
      .then((r) => r.json())
      .then((data) => {
        if (data.organization) {
          setOrg(data.organization);
          setOrgName(data.organization.name);
          setThreshold(data.organization.confidenceThreshold ?? 0.8);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!org) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: orgName }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Organization updated");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleThresholdSave() {
    if (!org) return;
    setSavingThreshold(true);
    try {
      const res = await fetch(`/api/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confidenceThreshold: threshold }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Confidence threshold updated");
    } catch {
      toast.error("Failed to save threshold");
    } finally {
      setSavingThreshold(false);
    }
  }

  if (loading)
    return <div className="text-slate-400 text-center py-12">Loading...</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      {/* Organization */}
      <div className="card-panel mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">Organization</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full px-3 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-white text-sm"
            />
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span>KB Entries: {org?.knowledgeEntryCount || 0}</span>
            <span>Questionnaires: {org?.questionnaireCount || 0}</span>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Confidence Tuning (CB-06) */}
      <div className="card-panel mb-6">
        <div className="flex items-center gap-2 mb-4">
          <SlidersHorizontal className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">
            AI Confidence Tuning
          </h2>
        </div>
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Answers with confidence at or above this threshold are marked as
            &quot;Pending Review&quot;. Below this threshold, answers are
            automatically flagged for manual attention.
          </p>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-slate-400">
                Confidence Threshold
              </label>
              <span className="text-lg font-mono font-bold text-indigo-400">
                {Math.round(threshold * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={Math.round(threshold * 100)}
              onChange={(e) => setThreshold(Number(e.target.value) / 100)}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between text-xs text-slate-600 mt-1">
              <span>10% (Accept most)</span>
              <span>100% (Flag most)</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <div className="text-emerald-400 font-medium mb-1">
                Auto-Approve
              </div>
              <div className="text-slate-400">
                &ge; {Math.round(threshold * 100)}%
              </div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <div className="text-amber-400 font-medium mb-1">Flagged</div>
              <div className="text-slate-400">
                {Math.round(threshold * 62.5)}% &ndash;{" "}
                {Math.round(threshold * 100) - 1}%
              </div>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <div className="text-red-400 font-medium mb-1">
                Low Confidence
              </div>
              <div className="text-slate-400">
                &lt; {Math.round(threshold * 62.5)}%
              </div>
            </div>
          </div>
          <button
            onClick={handleThresholdSave}
            disabled={savingThreshold}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {savingThreshold ? "Saving..." : "Save Threshold"}
          </button>
        </div>
      </div>

      {/* Account */}
      <div className="card-panel mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Users className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">Account</h2>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Email</span>
            <span className="text-white">{session?.user?.email || "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-400">Role</span>
            <span className="text-white">{session?.user?.role || "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
