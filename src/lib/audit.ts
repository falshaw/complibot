/**
 * CompliBot - audit trail writer.
 *
 * Records who did what to which record, per organization. Auditing must never
 * break the action itself, so failures are logged and swallowed.
 */

import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface AuditEvent {
  organizationId: string;
  userId?: string | null;
  /** dotted verb, e.g. "answer.approve", "knowledge.create" */
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  req?: NextRequest;
}

function clientIp(req?: NextRequest): string | null {
  if (!req || process.env.TRUST_PROXY !== "true") return null;
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  return fwd ? (fwd.split(",").pop()?.trim() ?? null) : null;
}

export async function audit(event: AuditEvent): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: event.organizationId,
        userId: event.userId ?? null,
        action: event.action,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        details: (event.details ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: clientIp(event.req),
      },
    });
  } catch (error) {
    logger.warn("Audit log write failed", {
      action: event.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
