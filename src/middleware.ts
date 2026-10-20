/**
 * CompliBot - Middleware (CSRF + Auth)
 */

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authConfig } from "@/lib/auth.config";

const authMiddleware = NextAuth(authConfig).auth;

function csrfCheck(request: NextRequest): NextResponse | null {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    const pathname = request.nextUrl.pathname;

    if (pathname.startsWith("/api/auth")) return null;

    if (pathname.startsWith("/api/")) {
      const origin = request.headers.get("origin");
      const host = request.headers.get("host");

      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost !== host) {
            return NextResponse.json(
              { error: "CSRF validation failed" },
              { status: 403 },
            );
          }
        } catch {
          return NextResponse.json(
            { error: "CSRF validation failed" },
            { status: 403 },
          );
        }
      } else if (!origin) {
        return NextResponse.json(
          { error: "CSRF validation failed: missing Origin header" },
          { status: 403 },
        );
      }
    }
  }
  return null;
}

export default function middleware(request: NextRequest) {
  const csrfResponse = csrfCheck(request);
  if (csrfResponse) return csrfResponse;
  return (
    authMiddleware as unknown as (
      req: NextRequest,
    ) => ReturnType<typeof NextResponse.next>
  )(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images|fonts|robots\\.txt|sitemap\\.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
