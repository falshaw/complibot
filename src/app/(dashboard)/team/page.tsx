"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Check, Copy, LockOpen, RotateCcw, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingBlocks, PageHeader } from "@/components/ui/PageHeader";
import { useRole } from "@/components/RoleContext";

interface Member {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  /** Locked out after 5 failed sign-ins (lifts by itself after 15 minutes). */
  locked: boolean;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  invitedBy: { name: string | null; email: string } | null;
}

interface CreatedInvite {
  email: string;
  role: string;
  expiresAt: string;
  inviteUrl: string;
}

const ROLES = [
  { id: "ADMIN", label: "Admin", badge: "b-red" },
  { id: "REVIEWER", label: "Reviewer", badge: "b-amber" },
  { id: "RESPONDER", label: "Responder", badge: "b-blue" },
  { id: "VIEWER", label: "Viewer", badge: "b-grey" },
];
const roleOf = (id: string) => ROLES.find((r) => r.id === id) ?? ROLES[3];
const shortDate = (d: string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function errorOf(res: Response, fallback: string) {
  const d = await res.json().catch(() => ({}));
  return (d as { error?: string }).error || fallback;
}

async function fetchTeam(): Promise<{ members: Member[]; invites: Invitation[] }> {
  const [m, i] = await Promise.all([fetch("/api/team/members"), fetch("/api/team/invite")]);
  return { members: m.ok ? await m.json() : [], invites: i.ok ? await i.json() : [] };
}

export default function TeamPage() {
  const { data: session } = useSession();
  const me = session?.user?.id;
  const isAdmin = useRole() === "ADMIN";
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("RESPONDER");
  const [inviteError, setInviteError] = useState("");
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [removeError, setRemoveError] = useState("");
  const inviteErrorId = useId();

  const load = useCallback(async () => {
    const t = await fetchTeam();
    setMembers(t.members);
    setInvites(t.invites);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchTeam().then((t) => {
      if (cancelled) return;
      setMembers(t.members);
      setInvites(t.invites);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
    setBusy(true);
    setInviteError("");
    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInviteError(data.details?.[0]?.message || data.error || "The invitation was not created. Try again.");
        return;
      }
      setCreated(data as CreatedInvite);
      setEmail("");
      setShowInvite(false);
      await load();
    } catch {
      setInviteError("The invitation was not created. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    setRemoveError("");
    const res = await fetch(`/api/team/members?userId=${removing.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setRemoveError(res ? await errorOf(res, "The member was not removed. Try again.") : "The member was not removed. Try again.");
      return;
    }
    toast.success(`${removing.email} removed`);
    setRemoving(null);
    await load();
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
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setShowInvite((v) => !v);
                setInviteError("");
              }}
              aria-expanded={showInvite}
              aria-controls="invite-form"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden /> Invite member
            </button>
          )
        }
      />

      {created && <InviteLink invite={created} onClose={() => setCreated(null)} />}

      {showInvite && (
        <form id="invite-form" className="card mb-4 p-4" onSubmit={invite} noValidate>
          <div className="grid gap-3 sm:grid-cols-[1fr_170px_auto]">
            <input
              type="email"
              className="input"
              placeholder="name@company.com"
              aria-label="Email to invite"
              aria-invalid={!!inviteError || undefined}
              aria-describedby={inviteError ? inviteErrorId : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
            <select className="input" aria-label="Role for the new member" value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary" disabled={busy || !email.trim()}>
              Create invitation
            </button>
          </div>
          {inviteError ? (
            <p id={inviteErrorId} className="mt-2.5 text-[13px] font-medium text-red" role="alert">
              {inviteError}
            </p>
          ) : (
            <p className="mt-2.5 text-xs text-ink-65">
              CompliBot sends no email. You get a one-time join link to pass on; it works once and expires after 7 days.
            </p>
          )}
        </form>
      )}

      {/* relative: keeps the sr-only header text inside the scroll box, so it cannot widen the page */}
      <section className="card relative mb-4 overflow-x-auto">
        {/* On a phone, role and action share one cell so the table fits 390 px. */}
        <table className="data-table max-sm:[&_td]:px-3 max-sm:[&_th]:px-3">
          <thead>
            <tr>
              <th>Member</th>
              <th className="hidden sm:table-cell">Last sign-in</th>
              <th className="text-right">
                Role<span className="sr-only"> and actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const r = roleOf(m.role);
              const self = m.id === me;
              return (
                <tr key={m.id}>
                  <td>
                    <div className={`flex items-center gap-2.5 ${m.isActive ? "" : "opacity-60"}`}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-bold text-white" aria-hidden>
                        {(m.name || m.email)[0].toUpperCase()}
                      </span>
                      <span className="min-w-0 max-w-[120px] sm:max-w-[240px]">
                        <b className="block truncate font-semibold">
                          {m.name || m.email}
                          {self && <span className="ml-1.5 text-xs font-normal text-ink-45">(you)</span>}
                        </b>
                        <span className="block truncate text-xs text-ink-65">{m.email}</span>
                      </span>
                    </div>
                  </td>
                  <td className="hidden text-xs text-ink-65 sm:table-cell">{m.lastLoginAt ? shortDate(m.lastLoginAt) : "never"}</td>
                  <td>
                    <div className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                      {isAdmin && !self && m.isActive ? (
                        <select
                          className="input !h-8 !w-28 !text-[13px] sm:!w-36"
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
                      ) : m.isActive ? (
                        <span className={`badge ${r.badge}`}>{r.label}</span>
                      ) : (
                        <span className="badge b-grey">Removed · {r.label}</span>
                      )}
                      {isAdmin && !self && m.isActive && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={busy}
                          onClick={() => {
                            setRemoveError("");
                            setRemoving(m);
                          }}
                          aria-label={`Remove ${m.email}`}
                        >
                          Remove
                        </button>
                      )}
                      {m.locked && !isAdmin && <span className="badge b-amber">Locked</span>}
                      {isAdmin && m.locked && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          aria-label={`Unlock ${m.email}`}
                          title="Locked after 5 failed sign-ins"
                          onClick={() =>
                            run(
                              fetch("/api/team/members", {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ userId: m.id, unlock: true }),
                              }),
                              `${m.email} can sign in again`,
                              "Could not unlock the member",
                            )
                          }
                        >
                          <LockOpen className="h-3.5 w-3.5" aria-hidden /> Unlock
                        </button>
                      )}
                      {isAdmin && !self && !m.isActive && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy}
                          aria-label={`Reactivate ${m.email}`}
                          onClick={() =>
                            run(
                              fetch("/api/team/members", {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ userId: m.id, isActive: true }),
                              }),
                              `${m.email} reactivated`,
                              "Could not reactivate the member",
                            )
                          }
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reactivate
                        </button>
                      )}
                    </div>
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
            The join link is shown once, when the invitation is created. To send a new link, revoke the invitation and
            invite again.
          </p>
          <ul className="divide-y divide-line-2">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <b className="block truncate font-semibold">{i.email}</b>
                  <span className="text-xs text-ink-65">
                    Expires {shortDate(i.expiresAt)}
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
                      title="Revoke invitation"
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

      <ConfirmDialog
        open={!!removing}
        title="Remove this member?"
        confirmLabel="Remove member"
        busy={busy}
        error={removeError}
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      >
        <p>
          <b className="text-ink">{removing?.email}</b> can no longer sign in or use CompliBot. Their answers, reviews
          and audit entries stay. You can reactivate them later.
        </p>
      </ConfirmDialog>
    </div>
  );
}

/** The join link, shown once right after the invitation is created. */
function InviteLink({ invite, onClose }: { invite: CreatedInvite; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();

  async function copy() {
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      setCopied(true);
    } catch {
      // Clipboard blocked (e.g. plain http on a LAN address): select the text instead.
      inputRef.current?.select();
      toast.message("Press Ctrl+C (or ⌘C) to copy the selected link");
    }
  }

  return (
    <section className="card mb-4 border-l-4 !border-l-teal p-4" aria-labelledby={labelId} role="region">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={labelId} className="flex items-center gap-1.5 !text-[14px] font-semibold">
            <Check className="h-4 w-4 shrink-0 text-teal" aria-hidden />
            Invitation created for {invite.email}
          </h2>
          <p className="mt-0.5 text-xs text-ink-65">
            Send this link to them. It is shown only now, works once and expires on {shortDate(invite.expiresAt)}.
          </p>
        </div>
        <button type="button" className="theme-btn !px-2" onClick={onClose} aria-label="Close the invitation link">
          <X aria-hidden />
        </button>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          ref={inputRef}
          className="input min-w-0 flex-1 font-mono !text-xs"
          aria-label={`Join link for ${invite.email}`}
          value={invite.inviteUrl}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className="btn btn-primary btn-sm shrink-0 sm:!h-[40px]" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </section>
  );
}
