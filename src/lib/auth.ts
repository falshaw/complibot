/**
 * CompliBot - NextAuth configuration
 */

import NextAuth, { CredentialsSignin } from "next-auth";
import type { Adapter } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { emailSchema, passwordSchema } from "./validators/password";
import prisma from "./prisma";
import type { Role } from "@prisma/client";
import { authConfig } from "./auth.config";
import { logger } from "./logger";
import { clearFailedLogins, isLockedOut, recordFailedLogin } from "./lockout";

/** Shown on the login page; failures count for unknown emails too, so it reveals nothing. */
class AccountLocked extends CredentialsSignin {
  code = "locked";
}

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  debug: false,
  // A failed sign-in is an expected event, not a server error with a stack trace
  logger: {
    error(error) {
      const type = (error as { type?: string }).type ?? error.name;
      if (type === "CredentialsSignin") logger.info("Sign-in refused", { code: (error as { code?: string }).code });
      else logger.error("Auth.js error", { type, error: error.message });
    },
  },
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
        // A malformed or too short input is a failed sign-in, not a server error
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        if (await isLockedOut(email)) {
          logger.warn("Sign-in refused: account locked");
          throw new AccountLocked();
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email },
            include: { organization: true },
          });

          const isValid =
            !!user?.passwordHash &&
            user.isActive &&
            (await bcrypt.compare(password, user.passwordHash));
          if (!user || !isValid) {
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
