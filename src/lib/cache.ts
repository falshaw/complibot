/**
 * CompliBot - Redis Caching Utility
 */

import Redis from "ioredis";
import { logger } from "@/lib/logger";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6384", 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const KEY_PREFIX = "cb:";

let _redis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!_redis) {
    _redis = new Redis({
      host: REDIS_HOST,
      port: REDIS_PORT,
      password: REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy(times: number) {
        return Math.min(times * 200, 5000);
      },
    });

    _redis.on("error", (err) => {
      logger.error("Cache Redis connection error", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    _redis.on("connect", () => {
      logger.info("Cache Redis connected", {
        host: REDIS_HOST,
        port: REDIS_PORT,
      });
    });

    _redis.connect().catch((e) => console.error("Redis connect failed:", e));
  }
  return _redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedisClient();
    const raw = await redis.get(`${KEY_PREFIX}${key}`);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.warn("Cache GET failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  try {
    const redis = getRedisClient();
    const serialized = JSON.stringify(value);
    await redis.set(`${KEY_PREFIX}${key}`, serialized, "EX", ttlSeconds);
  } catch (err) {
    logger.warn("Cache SET failed", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function cacheInvalidate(pattern: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const fullPattern = `${KEY_PREFIX}${pattern}`;
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        fullPattern,
        "COUNT",
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
  } catch (err) {
    logger.warn("Cache INVALIDATE failed", {
      pattern,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;
  const result = await fn();
  cacheSet(key, result, ttlSeconds).catch((e) =>
    console.error("Cache set failed:", e),
  );
  return result;
}

export async function closeCacheClient(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
