/**
 * CompliBot - your own account
 * GET:   name, email, role
 * PATCH: change your display name, or your password (needs the current one)
 *
 * Every role may do this. There is no email reset: an admin removes and
 * re-invites a member who forgot their password.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { apiHandler } from "@/lib/apiHandler";
import { audit } from "@/lib/audit";
import { RATE_LIMITS } from "@/lib/rateLimit";
import { passwordSchema } from "@/lib/validators/password";

const BCRYPT_ROUNDS = 12;

export const GET = apiHandler(
  async ({ user }) => {
    const me = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true, role: true },
    });
    return NextResponse.json(me);
  },
  { rateLimit: RATE_LIMITS.read },
);

const updateSchema = z.union([
  z.object({ name: z.string().trim().min(1, "Enter a name").max(100) }),
  z.object({
    currentPassword: z.string().min(1).max(200),
    newPassword: passwordSchema,
  }),
]);

export const PATCH = apiHandler(
  async ({ req, body, user, organizationId }) => {
    if ("name" in body) {
      await prisma.user.update({ where: { id: user.id }, data: { name: body.name } });
      await audit({
        organizationId,
        userId: user.id,
        action: "account.rename",
        entityType: "User",
        entityId: user.id,
        details: { name: body.name },
        req,
      });
      return NextResponse.json({ name: body.name });
    }

    const me = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!me?.passwordHash || !(await bcrypt.compare(body.currentPassword, me.passwordHash))) {
      return NextResponse.json({ error: "The current password is not correct" }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(body.newPassword, BCRYPT_ROUNDS) },
    });
    await audit({
      organizationId,
      userId: user.id,
      action: "account.password_change",
      entityType: "User",
      entityId: user.id,
      req,
    });
    return NextResponse.json({ success: true });
  },
  // the auth bucket: a wrong current password must not be guessable at API speed
  { schema: updateSchema, rateLimit: RATE_LIMITS.auth },
);
