import type { Message } from "@/types";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_RETRIES = 1;

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function requiredEnv(name: string): string {
  const raw = process.env[name];
  const value = raw ? normalizeEnvValue(raw) : "";
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const normalized = normalizeEnvValue(baseUrl).replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("LLM_BASE_URL is empty");
  }
  return normalized.endsWith("/v1")
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

function parseTimeoutMs(): number {
  const raw = process.env.LLM_TIMEOUT_MS;
  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number.parseInt(normalizeEnvValue(raw), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function parseMaxRetries(): number {
  const raw = process.env.LLM_MAX_RETRIES;
  if (!raw) {
    return DEFAULT_MAX_RETRIES;
  }
  const parsed = Number.parseInt(normalizeEnvValue(raw), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_MAX_RETRIES;
  }
  return Math.min(parsed, 3);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const withMeta = err as Error & { code?: string | number; cause?: unknown };
  const code = String(withMeta.code ?? "");
  if (err.name === "AbortError" || code === "20") {
    return true;
  }
  if (err.message.includes("aborted")) {
    return true;
  }
  if (withMeta.cause instanceof Error) {
    const cause = withMeta.cause as Error & { code?: string | number };
    const causeCode = String(cause.code ?? "");
    if (cause.name === "AbortError" || causeCode === "20") {
      return true;
    }
  }
  return false;
}

function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  if (isAbortError(err)) {
    return true;
  }
  const withMeta = err as Error & { code?: string; cause?: unknown };
  const retryableCodes = new Set([
    "ETIMEDOUT",
    "ECONNRESET",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "UND_ERR_CONNECT_TIMEOUT",
  ]);
  if (withMeta.code && retryableCodes.has(withMeta.code)) {
    return true;
  }
  if (withMeta.cause instanceof Error) {
    const cause = withMeta.cause as Error & { code?: string };
    return !!(cause.code && retryableCodes.has(cause.code));
  }
  return false;
}

function formatErrorDetails(err: unknown): string {
  if (!(err instanceof Error)) {
    return String(err);
  }

  const details: string[] = [err.message];
  const errorWithCause = err as Error & {
    cause?: unknown;
    code?: string;
  };

  if (errorWithCause.code) {
    details.push(`code=${errorWithCause.code}`);
  }

  const cause = errorWithCause.cause;
  if (cause instanceof Error) {
    details.push(`cause=${cause.message}`);
    const causeWithCode = cause as Error & { code?: string };
    if (causeWithCode.code) {
      details.push(`causeCode=${causeWithCode.code}`);
    }
  } else if (typeof cause === "string" && cause) {
    details.push(`cause=${cause}`);
  }

  return details.filter(Boolean).join("; ");
}

export async function llmChat(options: {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = requiredEnv("LLM_API_KEY");
  const baseUrl = process.env.LLM_BASE_URL || DEFAULT_BASE_URL;
  const endpoint = buildChatCompletionsUrl(baseUrl);
  const model = options.model || process.env.LLM_MODEL || "deepseek-chat";
  const timeoutMs = parseTimeoutMs();
  const maxRetries = parseMaxRetries();

  let res: Response | null = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: normalizeEnvValue(model),
          messages: options.messages,
          temperature: options.temperature ?? 0.6,
          max_tokens: options.maxTokens ?? 512,
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      break;
    } catch (err) {
      lastError = err;
      const canRetry = attempt < maxRetries && isRetryableNetworkError(err);
      if (!canRetry) {
        if (isAbortError(err)) {
          throw new Error(
            `请求 LLM 超时（${timeoutMs}ms）：${endpoint}。可在 .env.local 中增大 LLM_TIMEOUT_MS（例如 120000）。`
          );
        }
        throw new Error(
          `请求 LLM 失败（${endpoint}）：${formatErrorDetails(err)}。请检查 LLM_BASE_URL、LLM_API_KEY 与当前网络连接。`
        );
      }
      await sleep(400 * (attempt + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!res) {
    throw new Error(
      `请求 LLM 失败（${endpoint}）：${formatErrorDetails(lastError)}`
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM API error (${res.status}): ${text || res.statusText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?:
          | string
          | Array<{
              type?: string;
              text?: string;
            }>;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content;
  const textContent = Array.isArray(content)
    ? content
        .filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text?.trim())
        .filter(Boolean)
        .join("\n")
    : content;
  if (!textContent) {
    throw new Error("LLM API returned empty content");
  }

  return textContent;
}

export function safeJsonParse<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as T;
    }
    throw new Error("Failed to parse model JSON output");
  }
}
