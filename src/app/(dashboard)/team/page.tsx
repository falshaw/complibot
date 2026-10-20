"use client";

import { useEffect, useState } from "react";
import { Users, UserPlus, Mail, Shield, Clock, Trash2, X } from "lucide-react";

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: { name: string | null; email: string } | null;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  RESPONDER: "Responder",
  REVIEWER: "Reviewer",
  VIEWER: "Viewer",
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-red-500/20 text-red-300",
  RESPONDER: "bg-indigo-500/20 text-indigo-300",
  REVIEWER: "bg-amber-500/20 text-amber-300",
  VIEWER: "bg-slate-500/20 text-slate-300",
};

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("RESPONDER");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [membersRes, invitesRes] = await Promise.all([
      fetch("/api/team/members"),
      fetch("/api/team/invite"),
    ]);
    if (membersRes.ok) setMembers(await membersRes.json());
    if (invitesRes.ok) setInvitations(await invitesRes.json());
    setLoading(false);
  }

  async function sendInvite() {
    if (!inviteEmail) return;
    setSending(true);
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    if (res.ok) {
      setInviteEmail("");
      setShowInvite(false);
      loadData();
    }
    setSending(false);
  }

  async function updateRole(userId: string, role: string) {
    await fetch("/api/team/members", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role }),
    });
    loadData();
  }

  async function removeMember(userId: string) {
    if (!confirm("Remove this team member?")) return;
    await fetch(`/api/team/members?userId=${userId}`, { method: "DELETE" });
    loadData();
  }

  async function revokeInvite(id: string) {
    await fetch(`/api/team/invite?id=${id}`, { method: "DELETE" });
    loadData();
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-white/5 rounded w-48" />
          <div className="h-64 bg-white/5 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            Team Management
          </h1>
          <p className="text-sm text-white/50 mt-1">
            {members.length} member{members.length !== 1 ? "s" : ""} &middot;{" "}
            {invitations.length} pending invite
            {invitations.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Invite Member
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="card-panel p-4 border border-indigo-500/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium">Send Invitation</h3>
            <button onClick={() => setShowInvite(false)}>
              <X className="w-4 h-4 text-white/40 hover:text-white" />
            </button>
          </div>
          <div className="flex gap-3">
            <input
              type="email"
              placeholder="email@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 text-sm focus:outline-none focus:border-indigo-500"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="RESPONDER">Responder</option>
              <option value="REVIEWER">Reviewer</option>
              <option value="VIEWER">Viewer</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button
              onClick={sendInvite}
              disabled={sending || !inviteEmail}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}

      {/* Members table */}
      <div className="card-panel overflow-hidden">
        <div className="p-4 border-b border-white/5">
          <h2 className="text-white font-medium flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-400" />
            Members
          </h2>
        </div>
        <div className="divide-y divide-white/5">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-sm font-medium">
                  {(member.name || member.email)[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-white text-sm font-medium">
                    {member.name || member.email}
                    {!member.isActive && (
                      <span className="ml-2 text-xs text-red-400">
                        (inactive)
                      </span>
                    )}
                  </p>
                  <p className="text-white/40 text-xs">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={member.role}
                  onChange={(e) => updateRole(member.id, e.target.value)}
                  className="px-2 py-1 bg-white/5 border border-white/10 rounded text-white/70 text-xs focus:outline-none focus:border-indigo-500"
                >
                  {Object.entries(ROLE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>
                      {label}
                    </option>
                  ))}
                </select>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[member.role] || ROLE_COLORS.VIEWER}`}
                >
                  {ROLE_LABELS[member.role]}
                </span>
                <button
                  onClick={() => removeMember(member.id)}
                  className="text-white/20 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div className="card-panel overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h2 className="text-white font-medium flex items-center gap-2">
              <Mail className="w-4 h-4 text-amber-400" />
              Pending Invitations
            </h2>
          </div>
          <div className="divide-y divide-white/5">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02]"
              >
                <div>
                  <p className="text-white text-sm">{inv.email}</p>
                  <p className="text-white/40 text-xs flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                    {inv.invitedBy && (
                      <span>
                        {" "}
                        &middot; Invited by{" "}
                        {inv.invitedBy.name || inv.invitedBy.email}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[inv.role]}`}
                  >
                    {ROLE_LABELS[inv.role]}
                  </span>
                  <button
                    onClick={() => revokeInvite(inv.id)}
                    className="text-white/20 hover:text-red-400 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
