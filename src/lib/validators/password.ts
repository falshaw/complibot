import { z } from "zod";

/** One password rule for sign-in and for setting a password via an invite. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_SPECIAL = /[!@#$%^&*()_+\-=\[\]{}|;':",.<>?\/\\~`]/;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(200, "Use at most 200 characters")
  .regex(PASSWORD_SPECIAL, "Include at least one special character, e.g. ! ? # -");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.string().email("Enter a valid email address"));
