/**
 * CompliBot - Shared Ollama client with circuit breaker
 * Wraps OpenAI-compatible client pointing at Ollama.
 * 5-failure threshold, 5-min open state, auto-recovery.
 */

import OpenAI from "openai";
import { logger } from "./logger";

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

// LLM provider switch — "ollama" (default) or "claude" (optional HTTP bridge,
// see README: POST {CLAUDE_BRIDGE_URL}/generate).
// Embedding calls (ollamaFetchWithBreaker) ALWAYS stay on ollama — Claude
// doesn't expose an embeddings endpoint via the bridge.
const LLM_PROVIDER = (process.env.LLM_PROVIDER || "ollama").toLowerCase();
const CLAUDE_BRIDGE_URL =
  process.env.CLAUDE_BRIDGE_URL || "http://host.docker.internal:7777";
const CLAUDE_MODEL = (process.env.CLAUDE_MODEL || "opus").toLowerCase();

async function generateViaClaudeBridge(
  prompt: string,
  system?: string,
  cache?: boolean,
): Promise<string> {
  const res = await fetch(`${CLAUDE_BRIDGE_URL}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-App-Name": "complibot",
      ...(process.env.CLAUDE_BRIDGE_TOKEN
        ? { "X-Bridge-Token": process.env.CLAUDE_BRIDGE_TOKEN }
        : {}),
    },
    body: JSON.stringify({
      prompt,
      system,
      model: CLAUDE_MODEL,
      ...(cache ? { cache: true } : {}),
    }),
    signal: AbortSignal.timeout(130_000),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j?.error) detail = j.error;
    } catch {
      /* keep */
    }
    throw new Error(`Claude bridge error: ${detail}`);
  }
  const data = (await res.json()) as {
    ok: boolean;
    response?: string;
    error?: string;
  };
  if (!data.ok) throw new Error(`Claude bridge: ${data.error ?? "unknown"}`);
  return data.response ?? "";
}

// Singleton OpenAI client pointing at Ollama
let _openai: OpenAI | null = null;

export function getOllamaClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: "ollama",
      baseURL: `${OLLAMA_HOST}/v1`,
    });
  }
  return _openai;
}

// Circuit breaker state (module-level, shared across all calls)
let consecutiveFailures = 0;
let circuitOpenUntil: number | null = null;
const FAILURE_THRESHOLD = 5;
const CIRCUIT_OPEN_MS = 5 * 60 * 1000;

function isCircuitOpen(): boolean {
  if (circuitOpenUntil === null) return false;
  if (Date.now() < circuitOpenUntil) return true;
  // Half-open: timeout elapsed, reset and allow retry
  circuitOpenUntil = null;
  consecutiveFailures = 0;
  return false;
}

function recordSuccess(): void {
  consecutiveFailures = 0;
}

function recordFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
    logger.warn("Ollama circuit breaker OPEN — too many failures", {
      failures: consecutiveFailures,
      reopenIn: `${CIRCUIT_OPEN_MS / 1000}s`,
    });
  }
}

/**
 * Optional extra options for ollamaChatWithBreaker beyond the standard
 * OpenAI params. Currently supports `cache` (bridge LRU cache hint).
 */
export interface OllamaChatOptions {
  /** When true and LLM_PROVIDER=claude, passes cache:true to the bridge LRU
   *  cache. Only effective for deterministic prompts (same input → same output). */
  cache?: boolean;
}

/**
 * Circuit-breaker-protected wrapper for ollama.chat.completions.create().
 * Retries up to 3 times with exponential backoff on transient errors.
 */
export async function ollamaChatWithBreaker(
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  options?: OllamaChatOptions,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  if (isCircuitOpen()) {
    throw new Error(
      "AI service temporarily unavailable (circuit breaker open)",
    );
  }

  // Route through claude-bridge when LLM_PROVIDER=claude.
  // Translate OpenAI chat-completion params → bridge call, wrap response.
  if (LLM_PROVIDER === "claude") {
    try {
      const msgs = (params.messages ?? []) as Array<{
        role: string;
        content: string | Array<{ type: string; text?: string }>;
      }>;
      const systemMsg = msgs.find((m) => m.role === "system");
      const others = msgs.filter((m) => m.role !== "system");
      const flatten = (
        c: string | Array<{ type: string; text?: string }>,
      ): string =>
        typeof c === "string"
          ? c
          : c
              .map((p) => (p.type === "text" ? p.text ?? "" : ""))
              .join("");
      const prompt = others
        .map((m) => `${m.role}: ${flatten(m.content)}`)
        .join("\n\n");
      const system =
        systemMsg && typeof systemMsg.content === "string"
          ? systemMsg.content
          : systemMsg
            ? flatten(systemMsg.content)
            : undefined;
      const content = await generateViaClaudeBridge(
        prompt,
        system,
        options?.cache,
      );
      recordSuccess();
      return {
        id: `claude-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: `claude-${CLAUDE_MODEL}`,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content, refusal: null },
            finish_reason: "stop",
            logprobs: null,
          },
        ],
        usage: {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
        },
      } as unknown as OpenAI.Chat.Completions.ChatCompletion;
    } catch (error) {
      recordFailure();
      throw error;
    }
  }

  const ollama = getOllamaClient();
  const maxAttempts = 3;
  const backoffMs = [500, 1000];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await ollama.chat.completions.create(params);
      recordSuccess();
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      const isTransient =
        message.includes("ECONNREFUSED") ||
        message.includes("fetch failed") ||
        message.includes("network error") ||
        message.includes("Connection error") ||
        message.includes("500") ||
        message.includes("502") ||
        message.includes("503");

      if (!isTransient) {
        throw error;
      }

      recordFailure();
      logger.error("Ollama chat call failed", { error: message, attempt });
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt]));
        continue;
      }
      throw error;
    }
  }

  // Unreachable but satisfies TypeScript
  throw new Error("Ollama error: failed after retries");
}

/**
 * Circuit-breaker-protected wrapper for raw Ollama fetch calls (embeddings etc.).
 * Retries up to 3 times with exponential backoff on transient errors.
 */
export async function ollamaFetchWithBreaker(
  path: string,
  body: Record<string, unknown>,
): Promise<Response> {
  if (isCircuitOpen()) {
    throw new Error(
      "AI service temporarily unavailable (circuit breaker open)",
    );
  }

  const maxAttempts = 3;
  const backoffMs = [500, 1000];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(`${OLLAMA_HOST}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      // Do not retry on 4xx errors
      if (res.status >= 400 && res.status < 500) {
        throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
      }

      if (!res.ok) {
        recordFailure();
        if (attempt < maxAttempts - 1) {
          await new Promise((r) => setTimeout(r, backoffMs[attempt]));
          continue;
        }
        throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
      }

      recordSuccess();
      return res;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      const isConnectionError =
        message.includes("ECONNREFUSED") ||
        message.includes("fetch failed") ||
        message.includes("network error");

      if (!isConnectionError) {
        throw error;
      }

      recordFailure();
      logger.error("Ollama fetch failed", { path, error: message, attempt });
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt]));
        continue;
      }
      throw error;
    }
  }

  // Unreachable but satisfies TypeScript
  throw new Error("Ollama error: failed after retries");
}
