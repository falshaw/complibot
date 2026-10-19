/**
 * Prompt injection defense for LLM inputs.
 * Shared input sanitization helpers.
 * PROMPT_VERSION: 2026-03-01
 */

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/gi,
  /ignore\s+(all\s+)?above\s+instructions/gi,
  /disregard\s+(all\s+)?previous/gi,
  /forget\s+(all\s+)?previous/gi,
  /you\s+are\s+now/gi,
  /new\s+instructions?:/gi,
  /system\s*:/gi,
  /assistant\s*:/gi,
  /\buser\s*:/gi,
  /\bprompt\s*:/gi,
  /\[INST\]/gi,
  /\[\/INST\]/gi,
  /<<SYS>>/gi,
  /<\/SYS>/gi,
  /###\s*(system|instruction|human|assistant)/gi,
];

export function sanitizeForPrompt(
  input: unknown,
  maxLength: number = 2000,
): string {
  if (input === null || input === undefined) return "";

  let value = String(input);
  value = value.replace(/[\r\n]+/g, " ");
  value = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");

  for (const pattern of INJECTION_PATTERNS) {
    value = value.replace(pattern, "[filtered]");
  }

  value = value.replace(/\s{2,}/g, " ").trim();

  if (value.length > maxLength) {
    value = value.substring(0, maxLength);
  }

  return value;
}

export function extractJson<T>(text: string): T | null {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();
  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}
