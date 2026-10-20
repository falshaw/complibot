import { vi } from "vitest";

// Mock Next.js server components
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
  headers: vi.fn(() => new Headers()),
}));

// Mock NextAuth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() =>
    Promise.resolve({
      user: {
        id: "test-user-id",
        email: "test@example.com",
        name: "Test User",
        role: "ADMIN",
        organizationId: "test-org-id",
      },
    }),
  ),
  handlers: { GET: vi.fn(), POST: vi.fn() },
}));

// Mock Prisma
vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeEntry: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    questionnaire: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    question: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
    },
    answer: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    knowledgeSource: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    interviewSession: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: unknown) =>
      typeof fn === "function" ? fn({}) : Promise.all(fn),
    ),
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
  getPool: vi.fn(() => ({
    query: vi.fn(),
  })),
}));

// Mock logger
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    ai: { generate: vi.fn(), embed: vi.fn() },
    knowledge: { ingest: vi.fn() },
  },
}));

// Mock cache
vi.mock("@/lib/cache", () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    disconnect: vi.fn(),
  },
}));
