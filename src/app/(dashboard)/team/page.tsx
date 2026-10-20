"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { LoadingBlocks, PageHeader } from "@/components/ui/PageHeader";

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  invitedBy: { name: string | null; email: string } | null;
}

const ROLES = [
  { id: "ADMIN", label: "Admin", badge: "b-red" },
  { id: "REVIEWER", label: "Reviewer", badge: "b-amber" },
  { id: "RESPONDER", label: "Responder", badge: "b-blue" },
  { id: "VIEWER", label: "Viewer", badge: "b-grey" },
];
const roleOf = (id: string) => ROLES.find((r) => r.id === id) ?? ROLES[3];

async function errorOf(res: Response, fallback: string) {
  const d = await res.json().catch(() => ({}));
  return (d as { error?: string }).error || fallback;
}

export default function TeamPage() {
  const { data: session } = useSession();
  const me = session?.user?.id;
  const isAdmin = session?.user?.role === "ADMIN";
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("RESPONDER");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [m, i] = await Promise.all([fetch("/api/team/members"), fetch("/api/team/invite")]);
    setMembers(m.ok ? await m.json() : []);
    setInvites(i.ok ? await i.json() : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(p: Promise<Response>, ok: string, fail: string) {
    setBusy(true);
    try {
      const res = await p;
      if (!res.ok) throw new Error(await errorOf(res, fail));
      toast.success(ok);
      await load();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : fail);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const done = await run(
      fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      }),
      `Invitation created for ${email}`,
      "Could not create the invitation",
    );
    if (done) {
      setEmail("");
      setShowInvite(false);
    }
  }

  if (members === null) return <LoadingBlocks rows={2} />;
  const active = members.filter((m) => m.isActive).length;

  return (
    <div className="max-w-4xl">
      <PageHeader
        eyebrow="Tools"
        title="Team"
        sub={`${active} active ${active === 1 ? "member" : "members"} · ${invites.length} pending ${invites.length === 1 ? "invitation" : "invitations"}`}
        actions={
          isAdmin && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowInvite((v) => !v)} aria-expanded={showInvite}>
              <UserPlus className="h-3.5 w-3.5" aria-hidden /> Invite member
            </button>
          )
        }
      />

      {showInvite && (
        <form className="card mb-4 grid gap-3 p-4 sm:grid-cols-[1fr_170px_auto]" onSubmit={invite}>
          <input type="email" className="input" placeholder="name@company.com" aria-label="Email to invite" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <select className="input" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary" disabled={busy || !email}>
            Create invitation
          </button>
        </form>
      )}

      <section className="card mb-4 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th className="hidden sm:table-cell">Last sign-in</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const r = roleOf(m.role);
              const self = m.id === me;
              return (
                <tr key={m.id} className={m.isActive ? "" : "opacity-60"}>
                  <td className="max-w-[260px]">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-white" aria-hidden>
                        {(m.name || m.email)[0].toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <b className="block truncate font-semibold">
                          {m.name || m.email}
                          {self && <span className="ml-1.5 text-xs font-normal text-ink-45">(you)</span>}
                        </b>
                        <span className="block truncate text-xs text-ink-65">{m.email}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    {isAdmin && !self && m.isActive ? (
                      <select
                        className="input !h-8 !w-36 !text-[13px]"
                        aria-label={`Role of ${m.email}`}
                        value={m.role}
                        disabled={busy}
                        onChange={(e) =>
                          run(
                            fetch("/api/team/members", {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ userId: m.id, role: e.target.value }),
                            }),
                            `Role changed to ${roleOf(e.target.value).label}`,
                            "Could not change the role",
                          )
                        }
                      >
                        {ROLES.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`badge ${m.isActive ? r.badge : "b-grey"}`}>{m.isActive ? r.label : "Removed"}</span>
                    )}
                  </td>
                  <td className="hidden text-xs text-ink-65 sm:table-cell">
                    {m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "never"}
                  </td>
                  <td className="text-right">
                    {isAdmin && !self && m.isActive && (
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={busy}
                        onClick={() => {
                          if (!confirm(`Remove ${m.email} from the team? They can no longer sign in.`)) return;
                          run(fetch(`/api/team/members?userId=${m.id}`, { method: "DELETE" }), "Member removed", "Could not remove the member");
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {invites.length > 0 && (
        <section className="card p-[18px]">
          <h2 className="mb-1">Pending invitations</h2>
          <p className="mb-3 text-xs text-ink-65">
            Invitations are stored here; CompliBot does not send email.
          </p>
          <ul className="divide-y divide-line-2">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <b className="block truncate font-semibold">{i.email}</b>
                  <span className="text-xs text-ink-65">
                    Expires {new Date(i.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    {i.invitedBy && <> · invited by {i.invitedBy.name || i.invitedBy.email}</>}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`badge ${roleOf(i.role).badge}`}>{roleOf(i.role).label}</span>
                  {isAdmin && (
                    <button
                      type="button"
                      className="theme-btn !px-2"
                      aria-label={`Revoke invitation for ${i.email}`}
                      disabled={busy}
                      onClick={() => run(fetch(`/api/team/invite?id=${i.id}`, { method: "DELETE" }), "Invitation revoked", "Could not revoke the invitation")}
                    >
                      <X aria-hidden />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
