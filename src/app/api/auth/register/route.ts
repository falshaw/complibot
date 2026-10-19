import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { applyRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { logger } from "@/lib/logger";

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, "Password must contain an uppercase letter")
    .regex(/[a-z]/, "Password must contain a lowercase letter")
    .regex(/[0-9]/, "Password must contain a number"),
  organizationName: z.string().min(1).max(200),
});

export async function POST(req: NextRequest) {
  try {
    const limited = await applyRateLimit(req, RATE_LIMITS.auth, "register");
    if (limited) return limited;

    const body = registerSchema.parse(await req.json());

    // Generic success message to prevent email enumeration.
    // The same response is returned whether the email exists or not.
    const genericResponse = NextResponse.json(
      {
        message:
          "If this email is not already registered, an account has been created.",
      },
      { status: 200 },
    );

    // Check if user exists — return generic response to prevent enumeration
    const existingUser = await prisma.user.findUnique({
      where: { email: body.email },
    });

    if (existingUser) {
      logger.info("Registration attempted for existing email", {
        email: body.email,
      });
      return genericResponse;
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    // Create org + user in transaction
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: body.organizationName },
      });

      const user = await tx.user.create({
        data: {
          name: body.name,
          email: body.email,
          passwordHash,
          role: "ADMIN",
          organizationId: org.id,
        },
      });

      return { org, user };
    });

    logger.info("User registered", {
      userId: result.user.id,
      orgId: result.org.id,
    });

    return genericResponse;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 },
      );
    }
    logger.error("Registration failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
