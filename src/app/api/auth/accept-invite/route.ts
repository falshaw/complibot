/**
 * CompliBot — Accept Invitation API (CB-02)
 * POST: accept invitation and create/move user into org
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/apiHandler";

const acceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1).optional(),
  password: z.string().min(8).optional(),
});

export const POST = apiHandler(
  async ({ body }) => {
    const invitation = await prisma.organizationInvitation.findUnique({
      where: { token: body.token },
      include: { organization: true },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invalid invitation" },
        { status: 404 },
      );
    }

    if (invitation.acceptedAt) {
      return NextResponse.json(
        { error: "Invitation already accepted" },
        { status: 400 },
      );
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Invitation has expired" },
        { status: 400 },
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: invitation.email },
    });

    let userId: string;

    if (existingUser) {
      // Move user to new org
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          organizationId: invitation.organizationId,
          role: invitation.role,
          name: body.name || existingUser.name,
        },
      });
      userId = existingUser.id;
    } else {
      // Create new user — password handled via NextAuth registration flow
      const newUser = await prisma.user.create({
        data: {
          email: invitation.email,
          name: body.name || invitation.email.split("@")[0],
          role: invitation.role,
          organizationId: invitation.organizationId,
          isActive: true,
        },
      });
      userId = newUser.id;
    }

    // Mark invitation accepted
    await prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      userId,
      organizationName: invitation.organization.name,
    });
  },
  { schema: acceptSchema, auth: false },
);
