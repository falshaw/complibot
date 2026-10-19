/**
 * CompliBot - Rate Limiting
 */

import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "@/lib/cache";
import { logger } from "@/lib/logger";

export interface RateLimitConfig {
  interval: number;
  limit: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL = 60000;
let lastCleanup = Date.now();

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) rateLimitStore.delete(key);
  }
}

function getClientId(req: NextRequest): string {
  const trustProxy = process.env.TRUST_PROXY === "true";
  if (trustProxy) {
    const realIp = req.headers.get("x-real-ip");
    if (realIp) return realIp.trim();
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return parts[parts.length - 1];
    }
  }
  const ua = req.headers.get("user-agent") || "unknown";
  return `ua-${ua.slice(0, 50)}`;
}

const REDIS_RL_PREFIX = "cb:rl:";

async function checkRateLimitRedis(
  key: string,
  config: RateLimitConfig,
): Promise<{ limited: boolean; remaining: number; resetAt: number } | null> {
  try {
    const redis = getRedisClient();
    const redisKey = `${REDIS_RL_PREFIX}${key}`;
    const ttlSeconds = Math.ceil(config.interval / 1000);
    const count = await redis.incr(redisKey);
    if (count === 1) await redis.expire(redisKey, ttlSeconds);
    const remainingTTL = await redis.ttl(redisKey);
    if (remainingTTL < 0) await redis.expire(redisKey, ttlSeconds);
    const resetAt =
      Date.now() + (remainingTTL > 0 ? remainingTTL * 1000 : config.interval);
    return {
      limited: count > config.limit,
      remaining: Math.max(0, config.limit - count),
      resetAt,
    };
  } catch {
    return null;
  }
}

function checkRateLimitMemory(
  key: string,
  config: RateLimitConfig,
): { limited: boolean; remaining: number; resetAt: number } {
  cleanupExpiredEntries();
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || entry.resetAt < now) {
    const newEntry = { count: 1, resetAt: now + config.interval };
    rateLimitStore.set(key, newEntry);
    return {
      limited: false,
      remaining: config.limit - 1,
      resetAt: newEntry.resetAt,
    };
  }
  entry.count++;
  if (entry.count > config.limit)
    return { limited: true, remaining: 0, resetAt: entry.resetAt };
  return {
    limited: false,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

export async function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig,
  prefix: string = "global",
): Promise<{ limited: boolean; remaining: number; resetAt: number }> {
  const clientId = getClientId(req);
  const key = `${prefix}:${clientId}`;
  const redisResult = await checkRateLimitRedis(key, config);
  if (redisResult !== null) return redisResult;
  logger.debug("Rate limiter falling back to in-memory store");
  return checkRateLimitMemory(key, config);
}

export function rateLimitResponse(
  remaining: number,
  resetAt: number,
): NextResponse {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return NextResponse.json(
    { error: "Too Many Requests", message: "Rate limit exceeded.", retryAfter },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
      },
    },
  );
}

export async function applyRateLimit(
  req: NextRequest,
  config: RateLimitConfig = RATE_LIMITS.api,
  prefix: string = "api",
): Promise<NextResponse | null> {
  const { limited, remaining, resetAt } = await checkRateLimit(
    req,
    config,
    prefix,
  );
  if (limited) return rateLimitResponse(remaining, resetAt);
  return null;
}

export const RATE_LIMITS = {
  auth: {
    interval: 60 * 1000,
    limit: parseInt(process.env.RATE_LIMIT_AUTH_PER_MINUTE || "10"),
  },
  api: {
    interval: 60 * 1000,
    limit: parseInt(process.env.RATE_LIMIT_PER_MINUTE || "100"),
  },
  read: { interval: 60 * 1000, limit: 200 },
  expensive: { interval: 60 * 1000, limit: 10 },
  upload: { interval: 60 * 1000, limit: 5 },
  ai: { interval: 60 * 1000, limit: 20 },
};
