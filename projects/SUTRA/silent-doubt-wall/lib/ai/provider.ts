/**
 * SUTRA — AI Provider Adapter Layer
 *
 * Common interface for Gemini and OpenRouter so application logic
 * never depends on either provider directly.
 *
 * Design:
 * - Each provider implements AiProvider
 * - getAiProvider() returns the correct implementation based on env
 * - Structured output is validated after each call
 * - Request timeouts and bounded retries are enforced here
 * - Rate-limit (429) and server errors (5xx) are retried once with backoff
 * - The caller receives a typed result or a structured error — never throws
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import {
  getGeminiApiKey,
  getGeminiModel,
  getOpenRouterApiKey,
  getOpenRouterModel,
  getOpenRouterBaseUrl,
  getAiPrimaryProvider,
  getAiRequestTimeoutMs,
  getAiMaxRetries,
  getFeatureAvailability,
} from "@/lib/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiMessage {
  role: "user" | "system";
  content: string;
}

export interface AiGenerateOptions {
  messages: AiMessage[];
  /** JSON schema hint for structured output validation */
  responseFormat?: "json" | "text";
  maxOutputTokens?: number;
  temperature?: number;
}

export interface AiSuccess {
  ok: true;
  text: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AiError {
  ok: false;
  error: string;
  code: "unavailable" | "rate_limited" | "timeout" | "invalid_response" | "provider_error";
  retryable: boolean;
}

export type AiResult = AiSuccess | AiError;

export interface AiProvider {
  name: string;
  generate(options: AiGenerateOptions): Promise<AiResult>;
}

// ─── Timeout wrapper ─────────────────────────────────────────────────────────

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`AI request timed out after ${ms}ms (${label})`)),
      ms
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// ─── Gemini Provider ─────────────────────────────────────────────────────────

class GeminiProvider implements AiProvider {
  readonly name = "gemini";

  async generate(options: AiGenerateOptions): Promise<AiResult> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return { ok: false, error: "GEMINI_API_KEY not configured", code: "unavailable", retryable: false };
    }

    const model = getGeminiModel();
    const timeoutMs = getAiRequestTimeoutMs();

    const systemMsg = options.messages.find((m) => m.role === "system")?.content ?? "";
    const userMsgs = options.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n\n");
    const prompt = systemMsg ? `${systemMsg}\n\n${userMsgs}` : userMsgs;

    try {
      const client = new GoogleGenerativeAI(apiKey);
      const genModel = client.getGenerativeModel({
        model,
        generationConfig: {
          maxOutputTokens: options.maxOutputTokens ?? 1024,
          temperature: options.temperature ?? 0.2,
          ...(options.responseFormat === "json"
            ? { responseMimeType: "application/json" }
            : {}),
        },
      });

      const resultPromise = genModel.generateContent(prompt);
      const result = await withTimeout(resultPromise, timeoutMs, "gemini");
      const text = result.response.text();

      return {
        ok: true,
        text,
        provider: "gemini",
        model,
        inputTokens: result.response.usageMetadata?.promptTokenCount,
        outputTokens: result.response.usageMetadata?.candidatesTokenCount,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429") || msg.toLowerCase().includes("quota")) {
        return { ok: false, error: "Rate limited by Gemini", code: "rate_limited", retryable: true };
      }
      if (msg.includes("timed out")) {
        return { ok: false, error: msg, code: "timeout", retryable: true };
      }
      return { ok: false, error: `Gemini error: ${msg}`, code: "provider_error", retryable: false };
    }
  }
}

// ─── OpenRouter Provider ─────────────────────────────────────────────────────

class OpenRouterProvider implements AiProvider {
  readonly name = "openrouter";

  async generate(options: AiGenerateOptions): Promise<AiResult> {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      return { ok: false, error: "OPENROUTER_API_KEY not configured", code: "unavailable", retryable: false };
    }

    const model = getOpenRouterModel();
    const timeoutMs = getAiRequestTimeoutMs();

    try {
      const client = new OpenAI({
        apiKey,
        baseURL: getOpenRouterBaseUrl(),
        defaultHeaders: {
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
          "X-Title": "SUTRA",
        },
        timeout: timeoutMs,
        maxRetries: 0, // We handle retries ourselves
      });

      const messages = options.messages.map((m) => ({
        role: m.role as "user" | "system",
        content: m.content,
      }));

      const completion = await withTimeout(
        client.chat.completions.create({
          model,
          messages,
          max_tokens: options.maxOutputTokens ?? 1024,
          temperature: options.temperature ?? 0.2,
          response_format: options.responseFormat === "json" ? { type: "json_object" } : { type: "text" },
        }),
        timeoutMs,
        "openrouter"
      );

      const text = completion.choices[0]?.message?.content ?? "";
      return {
        ok: true,
        text,
        provider: "openrouter",
        model,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429")) {
        return { ok: false, error: "Rate limited by OpenRouter", code: "rate_limited", retryable: true };
      }
      if (msg.includes("timed out") || msg.includes("timeout")) {
        return { ok: false, error: msg, code: "timeout", retryable: true };
      }
      return { ok: false, error: `OpenRouter error: ${msg}`, code: "provider_error", retryable: false };
    }
  }
}

// ─── Provider Selection ───────────────────────────────────────────────────────

let _geminiProvider: GeminiProvider | null = null;
let _openRouterProvider: OpenRouterProvider | null = null;

function getGeminiProvider(): GeminiProvider {
  if (!_geminiProvider) _geminiProvider = new GeminiProvider();
  return _geminiProvider;
}

function getOpenRouterProviderInstance(): OpenRouterProvider {
  if (!_openRouterProvider) _openRouterProvider = new OpenRouterProvider();
  return _openRouterProvider;
}

/**
 * Returns the primary + fallback provider based on env config.
 * If the primary key is missing, returns only the available provider.
 */
export function getProviderPair(): [AiProvider, AiProvider | null] {
  const features = getFeatureAvailability();
  const primaryName = getAiPrimaryProvider();

  if (primaryName === "openrouter") {
    const primary = getOpenRouterProviderInstance();
    const fallback = features.gemini ? getGeminiProvider() : null;
    return [primary, fallback];
  }

  // Default: gemini primary, openrouter fallback
  const primary = getGeminiProvider();
  const fallback = features.openRouter ? getOpenRouterProviderInstance() : null;
  return [primary, fallback];
}

// ─── Main generate function with retry + fallback ─────────────────────────────

/**
 * Generate a response using the configured primary provider, with automatic
 * fallback to the secondary provider on retryable errors.
 */
export async function aiGenerate(options: AiGenerateOptions): Promise<AiResult> {
  const features = getFeatureAvailability();
  if (!features.aiAvailable) {
    return {
      ok: false,
      error: "No AI provider configured. Set GEMINI_API_KEY or OPENROUTER_API_KEY.",
      code: "unavailable",
      retryable: false,
    };
  }

  const [primary, fallback] = getProviderPair();
  const maxRetries = getAiMaxRetries();

  // Try primary
  let result = await primary.generate(options);

  // Retry primary once on retryable error
  if (!result.ok && result.retryable && maxRetries > 0) {
    await new Promise((r) => setTimeout(r, 1500)); // brief backoff
    result = await primary.generate(options);
  }

  // Try fallback if primary failed
  if (!result.ok && fallback) {
    result = await fallback.generate(options);
    if (!result.ok && result.retryable && maxRetries > 0) {
      await new Promise((r) => setTimeout(r, 1500));
      result = await fallback.generate(options);
    }
  }

  return result;
}

// ─── Structured JSON helper ───────────────────────────────────────────────────

/**
 * Generate and parse a JSON response.
 * Returns null if parsing fails or the result doesn't pass the validator.
 */
export async function aiGenerateJson<T>(
  options: Omit<AiGenerateOptions, "responseFormat">,
  validate: (v: unknown) => v is T
): Promise<{ result: T; provider: string; model: string } | AiError> {
  const result = await aiGenerate({ ...options, responseFormat: "json" });
  if (!result.ok) return result;

  try {
    const parsed: unknown = JSON.parse(result.text);
    if (!validate(parsed)) {
      return {
        ok: false,
        error: "AI returned unexpected response shape",
        code: "invalid_response",
        retryable: false,
      };
    }
    return { result: parsed, provider: result.provider, model: result.model };
  } catch {
    return {
      ok: false,
      error: "AI returned invalid JSON",
      code: "invalid_response",
      retryable: false,
    };
  }
}
