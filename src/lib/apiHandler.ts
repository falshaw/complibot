/**
 * CompliBot - Shared API route wrapper
 */

import { NextRequest, NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import type { Role } from "@prisma/client";
import { getSession } from "./session";
import { applyRateLimit, RATE_LIMITS, type RateLimitConfig } from "./rateLimit";
import { logger } from "./logger";

interface ApiHandlerOptions<T> {
  schema?: ZodSchema<T>;
  auth?: boolean;
  roles?: Role[];
  rateLimit?: RateLimitConfig | false;
  rateLimitPrefix?: string;
}

interface UserContext {
  id: string;
  email: string;
  name: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  emailVerified?: Date | null;
}

interface HandlerContext<T = unknown> {
  body: T;
  user: UserContext;
  organizationId: string;
  req: NextRequest;
  params: Record<string, string>;
}

type HandlerFn<T = unknown> = (ctx: HandlerContext<T>) => Promise<NextResponse>;

export function apiHandler<T = unknown>(
  handler: HandlerFn<T>,
  options: ApiHandlerOptions<T> = {},
) {
  const {
    schema,
    auth: requireAuth = true,
    roles,
    rateLimit = RATE_LIMITS.api,
  } = options;
  // Each limit counts in its own bucket: sharing one counter would let
  // ordinary page loads use up the 5-per-minute upload allowance.
  const rateLimitPrefix =
    options.rateLimitPrefix ??
    (Object.entries(RATE_LIMITS).find(([, c]) => c === rateLimit)?.[0] || "api");

  return async (
    req: NextRequest,
    context?: { params?: Promise<Record<string, string>> },
  ): Promise<NextResponse> => {
    try {
      // 1. Rate limiting
      if (rateLimit !== false) {
        const limited = await applyRateLimit(req, rateLimit, rateLimitPrefix);
        if (limited) return limited;
      }

      // 2. Authentication
      let user: UserContext | undefined;
      if (requireAuth || roles) {
        const session = await getSession();
        if (!session?.user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        user = session.user as UserContext;

        if (roles && !roles.includes(user.role)) {
          return NextResponse.json(
            { error: "Forbidden", message: "Insufficient permissions" },
            { status: 403 },
          );
        }
      }

      // 3. Body validation
      let body: T = undefined as T;
      if (schema) {
        const raw = await req.json();
        body = schema.parse(raw);
      }

      // 4. Route params
      const params = context?.params ? await context.params : {};

      // 5. Execute handler
      return await handler({
        body,
        user: user!,
        organizationId: user?.organizationId || "",
        req,
        params,
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          { error: "Validation failed", details: error.issues },
          { status: 400 },
        );
      }
      if (error instanceof Error) {
        logger.api.error(req.method, req.url, error);
      }
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
  };
}
