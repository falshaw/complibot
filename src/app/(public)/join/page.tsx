"use client";

import { Suspense, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Loader2, Lock, Mail, User } from "lucide-react";
import { AppBackground, LogoMark, WordMark } from "@/components/AppBackground";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PASSWORD_MIN_LENGTH, PASSWORD_SPECIAL } from "@/lib/validators/password";

interface Invitation {
  email: string;
  role: string;
  organizationName: string;
  expiresAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  REVIEWER: "Reviewer",
  RESPONDER: "Responder",
  VIEWER: "Viewer",
};

type State =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "ready"; invitation: Invitation };

function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (!PASSWORD_SPECIAL.test(password)) return "Include at least one special character, e.g. ! ? # -";
  if (password !== confirm) return "The two passwords do not match.";
  return null;
}

function JoinForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<State>({ kind: "loading" });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const hintId = useId();
  const errorId = useId();

  useEffect(() => {
    let cancelled = false;
    const show = (s: State) => !cancelled && setState(s);
    if (!token) {
      queueMicrotask(() => show({ kind: "invalid", message: "This page needs the invitation link your administrator sent you." }));
      return;
    }
    fetch(`/api/invite?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        show(
          res.ok && data.valid
            ? { kind: "ready", invitation: data }
            : { kind: "invalid", message: data.error || "This invitation link is not valid." },
        );
      })
      .catch(() => show({ kind: "invalid", message: "Could not check the invitation. Reload the page to try again." }));
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== "ready") return;
    const problem = passwordProblem(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: name.trim() || undefined, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404 || res.status === 410) {
          setState({ kind: "invalid", message: data.error });
          return;
        }
        setError(data.details?.[0]?.message || data.error || "The account was not created. Try again.");
        return;
      }
      const login = await signIn("credentials", { email: state.invitation.email, password, redirect: false });
      if (login?.error) {
        router.push("/login");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("The account was not created. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <p className="flex items-center gap-2 text-[13px] text-ink-65" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking the invitation…
      </p>
    );
  }

  if (state.kind === "invalid") {
    return (
      <>
        <h1 className="!text-[22px]">Invitation not usable</h1>
        <p className="mt-2 text-[13.5px] text-ink-65" role="alert">
          {state.message}
        </p>
        <Link href="/login" className="btn btn-ghost mt-6 w-full">
          Go to sign in
        </Link>
      </>
    );
  }

  const inv = state.invitation;
  return (
    <form onSubmit={submit} noValidate>
      <h1 className="!text-[22px]">Join {inv.organizationName}</h1>
      <p className="mt-0.5 mb-[22px] text-[13px] text-ink-65">
        You were invited as <b className="font-semibold text-ink">{ROLE_LABEL[inv.role] ?? inv.role}</b>. Set a password to
        create your account.
      </p>

      <div className="grid gap-3">
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-[13px] h-4 w-4 -translate-y-1/2 text-ink-45" aria-hidden />
          <input className="input input-glass !pl-10" type="email" aria-label="Email" value={inv.email} readOnly autoComplete="username" />
        </div>
        <div className="relative">
          <User className="pointer-events-none absolute top-1/2 left-[13px] h-4 w-4 -translate-y-1/2 text-ink-45" aria-hidden />
          <input
            className="input input-glass !pl-10"
            type="text"
            placeholder="Your name (optional)"
            aria-label="Your name (optional)"
            autoComplete="name"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-[13px] h-4 w-4 -translate-y-1/2 text-ink-45" aria-hidden />
          <input
            className="input input-glass !pl-10"
            type="password"
            placeholder="Password"
            aria-label="Password"
            aria-describedby={error ? `${hintId} ${errorId}` : hintId}
            aria-invalid={!!error || undefined}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-[13px] h-4 w-4 -translate-y-1/2 text-ink-45" aria-hidden />
          <input
            className="input input-glass !pl-10"
            type="password"
            placeholder="Repeat password"
            aria-label="Repeat password"
            aria-invalid={!!error || undefined}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
      </div>
      <p id={hintId} className="mt-2 text-xs text-ink-45">
        At least {PASSWORD_MIN_LENGTH} characters, including a special character.
      </p>

      {error && (
        <p id={errorId} className="mt-3 text-[13px] font-medium text-red" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="btn btn-primary mt-5 !h-[46px] w-full shadow-[0_8px_22px_rgba(37,99,235,0.35)]"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {busy ? "Creating account…" : "Create account"}
      </button>
      <p className="mt-4 text-center text-[11.5px] text-ink-45">
        Link valid until{" "}
        {new Date(inv.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </p>
    </form>
  );
}

export default function JoinPage() {
  return (
    <>
      <AppBackground />
      <ThemeToggle className="fixed top-4 right-4 z-20" />
      <main className="grid min-h-screen place-items-center p-4">
        <div className="w-full max-w-[380px]">
          <div className="mb-5 flex items-center justify-center gap-2.5 text-base font-bold">
            <LogoMark size={38} />
            <WordMark />
          </div>
          <section className="glass !rounded-3xl px-7 py-[30px]">
            <Suspense fallback={null}>
              <JoinForm />
            </Suspense>
          </section>
          <div className="mt-[18px] text-center text-[11.5px] text-ink-45">
            Already have an account?{" "}
            <Link href="/login" className="text-accent underline-offset-2 hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
