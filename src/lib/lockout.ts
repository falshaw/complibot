/**
 * CompliBot - login lockout (Redis)
 *
 * Five failed sign-ins within 15 minutes lock an email address for the rest of
 * that window. Failures count for unknown addresses too, so the lock message
 * does not reveal which accounts exist. An admin can lift a lock on the Team page.
 */

import { getRedisClient } from "./cache";
import { logger } from "./logger";

export const LOCKOUT_MAX_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_SECONDS = 900;
const LOCKOUT_PREFIX = "cb:lockout:";

const keyFor = (email: string) => `${LOCKOUT_PREFIX}${email.toLowerCase()}`;

export async function isLockedOut(email: string): Promise<boolean> {
  try {
    const attempts = parseInt((await getRedisClient().get(keyFor(email))) || "0", 10);
    return attempts >= LOCKOUT_MAX_ATTEMPTS;
  } catch {
    // Without Redis there is no attempt counter; refuse rather than allow guessing
    logger.error("Redis unavailable for lockout check");
    return true;
  }
}

export async function recordFailedLogin(email: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const count = await redis.incr(keyFor(email));
    if (count === 1) await redis.expire(keyFor(email), LOCKOUT_WINDOW_SECONDS);
  } catch {}
}

export async function clearFailedLogins(email: string): Promise<void> {
  try {
    await getRedisClient().del(keyFor(email));
  } catch {}
}

/** Which of these addresses are locked right now. */
export async function lockedEmails(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  try {
    const values = await getRedisClient().mget(...emails.map(keyFor));
    return new Set(
      emails.filter((_, i) => parseInt(values[i] || "0", 10) >= LOCKOUT_MAX_ATTEMPTS),
    );
  } catch {
    return new Set();
  }
}
