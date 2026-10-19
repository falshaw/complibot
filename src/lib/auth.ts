/**
 * CompliBot - NextAuth configuration
 */

import NextAuth from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import prisma from "./prisma";
import type { Role } from "@prisma/client";
import { authConfig } from "./auth.config";
import { logger } from "./logger";
import { getRedisClient } from "./cache";

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SECONDS = 900;
const LOCKOUT_PREFIX = "cb:lockout:";

async function checkAccountLockout(
  email: string,
): Promise<{ locked: boolean; attempts: number }> {
  try {
    const redis = getRedisClient();
    const key = `${LOCKOUT_PREFIX}${email.toLowerCase()}`;
    const attempts = parseInt((await redis.get(key)) || "0", 10);
    return { locked: attempts >= LOCKOUT_MAX_ATTEMPTS, attempts };
  } catch {
    logger.error("Redis unavailable for lockout check", { email });
    return { locked: true, attempts: LOCKOUT_MAX_ATTEMPTS };
  }
}

async function recordFailedLogin(email: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `${LOCKOUT_PREFIX}${email.toLowerCase()}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, LOCKOUT_WINDOW_SECONDS);
  } catch {}
}

async function clearFailedLogins(email: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(`${LOCKOUT_PREFIX}${email.toLowerCase()}`);
  } catch {}
}

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .regex(
      /[!@#$%^&*()_+\-=\[\]{}|;':",.<>?\/\\]/,
      "Password must contain at least one special character",
    ),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  debug: false,
  secret: process.env.AUTH_SECRET,
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const { email, password } = loginSchema.parse(credentials);

          // Mock auth for development
          const isDevEnv = process.env.NODE_ENV === "development";
          const isMockEnabled = process.env.USE_MOCK_AUTH === "true";
          const isProductionUrl = (process.env.NEXTAUTH_URL || "").includes(
            "complibot.com",
          );

          if (isDevEnv && isMockEnabled && !isProductionUrl) {
            const mockEmail = process.env.MOCK_AUTH_EMAIL;
            const mockPassword = process.env.MOCK_AUTH_PASSWORD;
            if (!mockEmail || !mockPassword) {
              throw new Error(
                "Mock auth enabled but credentials not configured",
              );
            }
            if (email === mockEmail && password === mockPassword) {
              logger.warn("MOCK AUTH LOGIN - development only", {
                email: mockEmail,
              });
              return {
                id: process.env.MOCK_AUTH_USER_ID || "mock-user-001",
                email: mockEmail,
                name: process.env.MOCK_AUTH_NAME || "Demo Admin",
                image: null,
                role: (process.env.MOCK_AUTH_ROLE || "ADMIN") as Role,
                organizationId: process.env.MOCK_AUTH_ORG_ID || "mock-org-001",
                organizationName:
                  process.env.MOCK_AUTH_ORG_NAME || "Demo Organization",
              };
            }
            return null;
          }

          const lockout = await checkAccountLockout(email);
          if (lockout.locked) {
            logger.warn("Account locked", { email });
            throw new Error(
              "Account temporarily locked. Try again in 15 minutes.",
            );
          }

          const user = await prisma.user.findUnique({
            where: { email },
            include: { organization: true },
          });

          if (!user || !user.passwordHash) {
            await recordFailedLogin(email);
            return null;
          }

          if (!user.isActive) throw new Error("Account is disabled");

          const isValidPassword = await bcrypt.compare(
            password,
            user.passwordHash,
          );
          if (!isValidPassword) {
            await recordFailedLogin(email);
            return null;
          }

          await clearFailedLogins(email);
          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role,
            organizationId: user.organizationId,
            organizationName: user.organization.name,
            emailVerified: user.emailVerified,
          };
        } catch (error) {
          logger.error("Auth credentials error", {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      },
    }),
  ],
});

declare module "next-auth" {
  interface User {
    name?: string | null;
    image?: string | null;
    role: Role;
    organizationId: string;
    organizationName: string;
    emailVerified?: Date | null;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: Role;
      organizationId: string;
      organizationName: string;
      emailVerified?: Date | null;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    organizationId: string;
    organizationName: string;
    emailVerified?: Date | null;
  }
}
