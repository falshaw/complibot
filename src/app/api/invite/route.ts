/**
 * CompliBot - Join with an invitation link (public, no session)
 * GET  /api/invite?token=...  what the link is for (email, organization, role)
 * POST /api/invite            { token, name?, password } creates the account
 *
 * The token is single-use: the invitation is claimed with a conditional
 * update in the same transaction that creates the user, so a link that was
 * used, revoked or has expired (or is used twice at once) creates nothing.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/apiHandler";
import { audit } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/rateLimit";
import {
  hashInviteToken,
  INVITATION_MESSAGES,
  invitationProblem,
  isWellFormedToken,
} from "@/lib/invitations";
import { passwordSchema } from "@/lib/validators/password";

const BCRYPT_ROUNDS = 12;

function problemResponse(problem: keyof typeof INVITATION_MESSAGES) {
  return NextResponse.json(
    { error: INVITATION_MESSAGES[problem], reason: problem },
    { status: problem === "invalid" ? 404 : 410 },
  );
}

async function findInvitation(token: unknown) {
  if (!isWellFormedToken(token)) return null;
  return prisma.organizationInvitation.findUnique({
    where: { token: hashInviteToken(token) },
    include: { organization: { select: { name: true } } },
  });
}

export const GET = apiHandler(
  async ({ req }) => {
    const invitation = await findInvitation(req.nextUrl.searchParams.get("token"));
    const problem = invitationProblem(invitation);
    if (problem || !invitation) return problemResponse(problem ?? "invalid");
    return NextResponse.json({
      email: invitation.email,
      role: invitation.role,
      organizationName: invitation.organization.name,
      expiresAt: invitation.expiresAt,
    });
  },
  { auth: false, rateLimit: RATE_LIMITS.auth, rateLimitPrefix: "invite" },
);

const acceptSchema = z.object({
  token: z.string(),
  name: z.string().trim().max(100).optional(),
  password: passwordSchema,
});

class InvitationGone extends Error {}

export const POST = apiHandler(
  async ({ req, body }) => {
    const invitation = await findInvitation(body.token);
    const problem = invitationProblem(invitation);
    if (problem || !invitation) return problemResponse(problem ?? "invalid");

    if (await prisma.user.findUnique({ where: { email: invitation.email } })) {
      return NextResponse.json(
        { error: "An account with this email already exists. Sign in instead." },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
    const now = new Date();
    let user: { id: string; email: string };
    try {
      user = await prisma.$transaction(async (tx) => {
        const claimed = await tx.organizationInvitation.updateMany({
          where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: now } },
          data: { acceptedAt: now },
        });
        if (claimed.count !== 1) throw new InvitationGone();
        return tx.user.create({
          data: {
            email: invitation.email,
            name: body.name || invitation.email.split("@")[0],
            passwordHash,
            role: invitation.role,
            organizationId: invitation.organizationId,
            isActive: true,
            // The invite link reached this address, which is the check
            // email verification would do.
            emailVerified: now,
          },
          select: { id: true, email: true },
        });
      });
    } catch (error) {
      if (error instanceof InvitationGone) return problemResponse("used");
      throw error;
    }

    await audit({
      organizationId: invitation.organizationId,
      userId: user.id,
      action: "team.join",
      entityType: "User",
      entityId: user.id,
      details: { email: user.email, role: invitation.role },
      req,
    });

    return NextResponse.json(
      { email: user.email, organizationName: invitation.organization.name },
      { status: 201 },
    );
  },
  {
    schema: acceptSchema,
    auth: false,
    rateLimit: RATE_LIMITS.auth,
    rateLimitPrefix: "invite",
  },
);
