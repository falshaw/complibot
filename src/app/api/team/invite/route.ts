/**
 * CompliBot - Team invitations (admin)
 * GET: list pending invitations
 * POST: create an invitation and return its one-time join link
 * DELETE: revoke an invitation
 *
 * CompliBot sends no email: the join link is returned once, shown to the
 * admin, and only its hash is stored (see src/lib/invitations.ts).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { apiHandler } from "@/lib/apiHandler";
import { inviteExpiry, joinUrl, newInviteToken } from "@/lib/invitations";
import { emailSchema } from "@/lib/validators/password";

// GET /api/team/invite: pending (not accepted, not expired) invitations
export const GET = apiHandler(async ({ organizationId }) => {
  const invitations = await prisma.organizationInvitation.findMany({
    where: { organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      createdAt: true,
      invitedBy: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(invitations);
});

const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["ADMIN", "RESPONDER", "REVIEWER", "VIEWER"]).default("RESPONDER"),
});

// POST /api/team/invite: create an invitation
export const POST = apiHandler(
  async ({ req, body, user, organizationId }) => {
    const existing = await prisma.user.findUnique({
      where: { email: body.email },
      select: { organizationId: true, isActive: true },
    });
    if (existing) {
      const message =
        existing.organizationId !== organizationId
          ? "An account with this email already exists."
          : existing.isActive
            ? "This person is already a member of the team."
            : "This person was removed from the team. Reactivate them in the member list instead.";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    const now = new Date();
    const previous = await prisma.organizationInvitation.findUnique({
      where: { organizationId_email: { organizationId, email: body.email } },
    });
    if (previous && !previous.acceptedAt && previous.expiresAt > now) {
      return NextResponse.json(
        {
          error:
            "An invitation for this email is still open. Revoke it first to create a new link.",
        },
        { status: 409 },
      );
    }

    const { token, tokenHash } = newInviteToken();
    const invitation = await prisma.$transaction(async (tx) => {
      // An expired or used invitation for the same email gives way to the new one.
      if (previous) {
        await tx.organizationInvitation.delete({ where: { id: previous.id } });
      }
      return tx.organizationInvitation.create({
        data: {
          organizationId,
          email: body.email,
          role: body.role,
          token: tokenHash,
          invitedById: user.id,
          expiresAt: inviteExpiry(now.getTime()),
        },
        select: { id: true, email: true, role: true, expiresAt: true },
      });
    });

    await audit({
      organizationId,
      userId: user.id,
      action: "team.invite",
      entityType: "OrganizationInvitation",
      entityId: invitation.id,
      details: { email: invitation.email, role: invitation.role },
      req,
    });

    const baseUrl = process.env.NEXTAUTH_URL || req.nextUrl.origin;
    return NextResponse.json(
      { ...invitation, inviteUrl: joinUrl(baseUrl, token) },
      { status: 201 },
    );
  },
  { schema: inviteSchema, roles: ["ADMIN"] },
);

// DELETE /api/team/invite?id=...: revoke an invitation
export const DELETE = apiHandler(
  async ({ req, user, organizationId }) => {
    const invitationId = new URL(req.url).searchParams.get("id");
    if (!invitationId) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const invitation = await prisma.organizationInvitation.findFirst({
      where: { id: invitationId, organizationId },
    });
    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    await prisma.organizationInvitation.delete({ where: { id: invitationId } });
    await audit({
      organizationId,
      userId: user.id,
      action: "team.invite_revoke",
      entityType: "OrganizationInvitation",
      entityId: invitationId,
      details: { email: invitation.email },
      req,
    });

    return NextResponse.json({ success: true });
  },
  { roles: ["ADMIN"] },
);
