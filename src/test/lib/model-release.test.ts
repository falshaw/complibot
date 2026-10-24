import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Batch jobs unload the local model when the last one finishes, so its RAM
 * comes back at once instead of after Ollama's 5-minute keep-alive.
 */

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const fetchMock = vi.fn(async () => new Response("{}"));
vi.stubGlobal("fetch", fetchMock);

import { withModelBatch } from "@/lib/ollama";

const releases = () =>
  fetchMock.mock.calls.filter((c) => {
    const [url, init] = c as unknown as [string, RequestInit];
    return url.endsWith("/api/generate") && JSON.parse(String(init.body)).keep_alive === 0;
  }).length;

beforeEach(() => fetchMock.mockClear());

describe("withModelBatch", () => {
  it("releases the model after a batch and returns its result", async () => {
    await expect(withModelBatch(async () => 42)).resolves.toBe(42);
    expect(releases()).toBe(1);
  });

  it("waits for the last of two overlapping batches", async () => {
    let finishFirst!: () => void;
    const first = withModelBatch(() => new Promise<void>((r) => (finishFirst = r)));
    await withModelBatch(async () => {});
    expect(releases()).toBe(0);

    finishFirst();
    await first;
    expect(releases()).toBe(1);
  });

  it("releases after a failed batch too", async () => {
    await expect(withModelBatch(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(releases()).toBe(1);
  });
});
