/**
 * CompliBot — Team Members API (CB-02)
 * GET: list team members
 * PUT: update member role
 * DELETE: remove member
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiHandler } from "@/lib/apiHandler";

// GET /api/team/members — list org members
export const GET = apiHandler(async ({ organizationId }) => {
  const members = await prisma.user.findMany({
    where: { organizationId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(members);
});

// PUT /api/team/members — update member role or deactivate
const updateSchema = z.object({
  userId: z.string(),
  role: z.enum(["ADMIN", "RESPONDER", "REVIEWER", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
});

export const PUT = apiHandler(
  async ({ body, user, organizationId }) => {
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    if (body.userId === user.id) {
      return NextResponse.json(
        { error: "Cannot modify your own role" },
        { status: 400 },
      );
    }

    const target = await prisma.user.findFirst({
      where: { id: body.userId, organizationId },
    });
    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { id: body.userId },
      data: {
        ...(body.role && { role: body.role }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    return NextResponse.json(updated);
  },
  { schema: updateSchema, roles: ["ADMIN"] },
);

// DELETE /api/team/members — remove member from org
export const DELETE = apiHandler(
  async ({ req, user, organizationId }) => {
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    if (userId === user.id) {
      return NextResponse.json(
        { error: "Cannot remove yourself" },
        { status: 400 },
      );
    }

    const target = await prisma.user.findFirst({
      where: { id: userId, organizationId },
    });
    if (!target) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  },
  { roles: ["ADMIN"] },
);
