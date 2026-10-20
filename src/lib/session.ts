/**
 * CompliBot - Session wrapper
 */

import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import prisma from "@/lib/prisma";
import { logger } from "./logger";

/**
 * The signed-in user, checked against the database: a member who was removed
 * gets no session even while their sign-in token is still valid, and a role
 * change applies at once instead of at the next sign-in.
 */
export async function getSession(): Promise<Session | null> {
  try {
    const session = await auth();
    if (!session?.user?.id) return null;
    const current = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isActive: true, role: true, organizationId: true },
    });
    if (!current?.isActive) return null;
    return {
      ...session,
      user: {
        ...session.user,
        role: current.role,
        organizationId: current.organizationId,
      },
    };
  } catch (error) {
    logger.warn("Session retrieval failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user;
}
