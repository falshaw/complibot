/**
 * CompliBot - where to go after sign-in.
 *
 * Only same-site app paths are allowed, so a crafted ?callbackUrl= can never
 * send the user to another site (or back to /login or an API route).
 */

const FALLBACK = "/dashboard";

export function safeCallbackPath(value: string | null | undefined): string {
  if (!value) return FALLBACK;
  let path = value.trim();
  // next-auth sometimes passes an absolute URL on the same origin
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
    if (!/^https?:\/\//i.test(path)) return FALLBACK;
    try {
      const u = new URL(path);
      if (typeof window === "undefined" || u.origin !== window.location.origin) {
        return FALLBACK;
      }
      path = u.pathname + u.search;
    } catch {
      return FALLBACK;
    }
  }
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path === "/login" ||
    path.startsWith("/login?") ||
    path.startsWith("/api/")
  ) {
    return FALLBACK;
  }
  return path;
}
