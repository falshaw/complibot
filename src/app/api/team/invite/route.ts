/**
 * CompliBot — Team Invitation API (CB-02)
 * GET: list pending invitations
 * POST: send invitation
 * DELETE: revoke invitation
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/apiHandler";

// GET /api/team/invite — list pending invitations
export const GET = apiHandler(async ({ organizationId }) => {
  const invitations = await prisma.organizationInvitation.findMany({
    where: { organizationId, acceptedAt: null },
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

// POST /api/team/invite — create invitation
const inviteSchema = z.object({
  email: z.string().email(),
  role: z
    .enum(["ADMIN", "RESPONDER", "REVIEWER", "VIEWER"])
    .default("RESPONDER"),
});

export const POST = apiHandler(
  async ({ body, user, organizationId }) => {
    // Check if user already exists in org
    const existing = await prisma.user.findFirst({
      where: { email: body.email, organizationId },
    });
    if (existing) {
      return NextResponse.json(
        { error: "User already in organization" },
        { status: 409 },
      );
    }

    // Check if invitation already pending
    const pendingInvite = await prisma.organizationInvitation.findFirst({
      where: {
        organizationId,
        email: body.email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (pendingInvite) {
      return NextResponse.json(
        { error: "Invitation already pending for this email" },
        { status: 409 },
      );
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await prisma.organizationInvitation.create({
      data: {
        organizationId,
        email: body.email,
        role: body.role,
        token,
        invitedById: user.id,
        expiresAt,
      },
      select: {
        id: true,
        email: true,
        role: true,
        token: true,
        expiresAt: true,
      },
    });

    return NextResponse.json({
      ...invitation,
      inviteUrl: `/join?token=${token}`,
    });
  },
  { schema: inviteSchema, roles: ["ADMIN"] },
);

// DELETE /api/team/invite — revoke invitation
export const DELETE = apiHandler(
  async ({ req, organizationId }) => {
    const { searchParams } = new URL(req.url);
    const invitationId = searchParams.get("id");
    if (!invitationId) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const invitation = await prisma.organizationInvitation.findFirst({
      where: { id: invitationId, organizationId },
    });
    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found" },
        { status: 404 },
      );
    }

    await prisma.organizationInvitation.delete({
      where: { id: invitationId },
    });

    return NextResponse.json({ success: true });
  },
  { roles: ["ADMIN"] },
);
