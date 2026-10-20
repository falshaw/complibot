/**
 * CompliBot - Correlation ID management for request tracing
 */

const isServer = typeof window === "undefined";

let AsyncLocalStorage: typeof import("async_hooks").AsyncLocalStorage | null =
  null;
let randomUUID: typeof import("crypto").randomUUID | null = null;

if (isServer) {
  // Lazy server-only require keeps these Node built-ins out of client bundles.
  /* eslint-disable @typescript-eslint/no-require-imports */
  AsyncLocalStorage = require("async_hooks").AsyncLocalStorage;
  randomUUID = require("crypto").randomUUID;
  /* eslint-enable @typescript-eslint/no-require-imports */
}

export interface RequestContext {
  correlationId: string;
  startTime: number;
  userId?: string;
  path?: string;
  method?: string;
}

type AsyncLocalStorageType =
  import("async_hooks").AsyncLocalStorage<RequestContext>;
let asyncLocalStorage: AsyncLocalStorageType | null = null;

if (isServer && AsyncLocalStorage) {
  asyncLocalStorage = new AsyncLocalStorage<RequestContext>();
}

export function getRequestContext(): RequestContext | undefined {
  if (!asyncLocalStorage) return undefined;
  return asyncLocalStorage.getStore();
}

export function getCorrelationId(): string {
  if (!asyncLocalStorage) return "no-context";
  return asyncLocalStorage.getStore()?.correlationId || "no-context";
}

export function getContextUserId(): string | undefined {
  if (!asyncLocalStorage) return undefined;
  return asyncLocalStorage.getStore()?.userId;
}

export function generateCorrelationId(): string {
  if (randomUUID) return `cid-${randomUUID().slice(0, 8)}`;
  return `cid-${Math.random().toString(36).slice(2, 10)}`;
}

export function runWithContext<T>(
  context: Partial<RequestContext>,
  fn: () => T,
): T {
  const fullContext: RequestContext = {
    correlationId: context.correlationId || generateCorrelationId(),
    startTime: context.startTime || Date.now(),
    ...context,
  };
  if (!asyncLocalStorage) return fn();
  return asyncLocalStorage.run(fullContext, fn);
}

export const CORRELATION_ID_HEADER = "x-correlation-id";

export function extractCorrelationId(
  headers: Headers | Record<string, string | string[] | undefined>,
): string {
  let correlationId: string | null | undefined;
  if (headers instanceof Headers) {
    correlationId = headers.get(CORRELATION_ID_HEADER);
  } else {
    const headerValue =
      headers[CORRELATION_ID_HEADER] || headers["x-correlation-id"];
    correlationId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  }
  return correlationId || generateCorrelationId();
}
