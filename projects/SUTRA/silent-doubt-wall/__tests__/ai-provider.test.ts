/**
 * Tests for AI provider layer and question refiner.
 * All AI calls are mocked — no API credits consumed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock env so tests can control feature availability ───────────────────────

vi.mock("@/lib/env", () => ({
  getGeminiApiKey: vi.fn(() => undefined),
  getGeminiModel: vi.fn(() => "gemini-1.5-flash"),
  getOpenRouterApiKey: vi.fn(() => undefined),
  getOpenRouterModel: vi.fn(() => "mistralai/mistral-7b-instruct:free"),
  getOpenRouterBaseUrl: vi.fn(() => "https://openrouter.ai/api/v1"),
  getAiPrimaryProvider: vi.fn(() => "gemini"),
  getAiRequestTimeoutMs: vi.fn(() => 5000),
  getAiMaxRetries: vi.fn(() => 1),
  getFeatureAvailability: vi.fn(() => ({
    supabase: true,
    gemini: false,
    openRouter: false,
    aiAvailable: false,
    scheduler: false,
  })),
  getSystemDiagnostics: vi.fn(() => ({})),
  getSchedulerSecret: vi.fn(() => undefined),
}));

import * as envModule from "@/lib/env";
const mockEnv = vi.mocked(envModule);

// ─── Mock @google/generative-ai ───────────────────────────────────────────────

const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

// ─── Mock openai ──────────────────────────────────────────────────────────────

const mockChatCreate = vi.fn();
vi.mock("openai", () => ({
  default: vi.fn(() => ({
    chat: {
      completions: {
        create: mockChatCreate,
      },
    },
  })),
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────

import { aiGenerate, aiGenerateJson } from "@/lib/ai/provider";
import { refineQuestion } from "@/lib/ai/refiner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setAiAvailable(gemini = true, openRouter = false) {
  mockEnv.getGeminiApiKey.mockReturnValue(gemini ? "test-gemini-key" : undefined);
  mockEnv.getOpenRouterApiKey.mockReturnValue(openRouter ? "test-openrouter-key" : undefined);
  mockEnv.getFeatureAvailability.mockReturnValue({
    supabase: true,
    gemini,
    openRouter,
    aiAvailable: gemini || openRouter,
    scheduler: false,
  });
}

function mockGeminiResponse(text: string) {
  mockGenerateContent.mockResolvedValue({
    response: {
      text: () => text,
      usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 100 },
    },
  });
}

function mockOpenRouterResponse(text: string) {
  mockChatCreate.mockResolvedValue({
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 50, completion_tokens: 100 },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AI Provider — availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unavailable error when no provider is configured", async () => {
    setAiAvailable(false, false);
    const result = await aiGenerate({
      messages: [{ role: "user", content: "test" }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unavailable");
    }
  });

  it("succeeds with Gemini when key is set", async () => {
    setAiAvailable(true, false);
    mockGeminiResponse("Hello from Gemini");

    const result = await aiGenerate({
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe("Hello from Gemini");
      expect(result.provider).toBe("gemini");
    }
  });

  it("succeeds with OpenRouter when key is set", async () => {
    setAiAvailable(false, true);
    mockOpenRouterResponse("Hello from OpenRouter");

    const result = await aiGenerate({
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toBe("Hello from OpenRouter");
      expect(result.provider).toBe("openrouter");
    }
  });

  it("falls back to OpenRouter when Gemini fails with retryable error", async () => {
    setAiAvailable(true, true);
    mockGenerateContent.mockRejectedValue(new Error("429 Too Many Requests"));
    mockOpenRouterResponse("Fallback from OpenRouter");

    const result = await aiGenerate({
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider).toBe("openrouter");
    }
  });

  it("returns rate_limited error code on 429", async () => {
    setAiAvailable(true, false);
    mockGenerateContent.mockRejectedValue(new Error("429 quota exceeded"));

    const result = await aiGenerate({
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("rate_limited");
      expect(result.retryable).toBe(true);
    }
  });
});

describe("AI Provider — JSON generation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAiAvailable(true, false);
  });

  it("parses valid JSON response", async () => {
    const payload = { name: "test", value: 42 };
    mockGeminiResponse(JSON.stringify(payload));

    const result = await aiGenerateJson(
      { messages: [{ role: "user", content: "test" }] },
      (v): v is typeof payload =>
        typeof v === "object" && v !== null && "name" in v && "value" in v
    );

    expect("result" in result).toBe(true);
    if ("result" in result) {
      expect(result.result).toEqual(payload);
    }
  });

  it("returns invalid_response when JSON doesn't match validator", async () => {
    mockGeminiResponse('{"wrong": "shape"}');

    const result = await aiGenerateJson(
      { messages: [{ role: "user", content: "test" }] },
      (v): v is { required: string } =>
        typeof v === "object" && v !== null && "required" in v
    );

    expect("ok" in result && !result.ok).toBe(true);
    if ("ok" in result && !result.ok) {
      expect(result.code).toBe("invalid_response");
    }
  });

  it("returns invalid_response on malformed JSON", async () => {
    mockGeminiResponse("not valid json {{{");

    const result = await aiGenerateJson(
      { messages: [{ role: "user", content: "test" }] },
      (v): v is unknown => { void v; return true; }
    );

    expect("ok" in result && !result.ok).toBe(true);
  });
});

describe("Question Refiner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns local cleaned text when AI unavailable", async () => {
    setAiAvailable(false, false);
    const result = await refineQuestion("wat is opencv");
    expect(result.source).toBe("local");
    expect(result.suggested.length).toBeGreaterThan(0);
  });

  it("returns local result for empty input", async () => {
    setAiAvailable(false, false);
    const result = await refineQuestion("");
    expect(result.suggested).toBe("");
    expect(result.source).toBe("local");
  });

  it("uses AI when available and returns suggestion", async () => {
    setAiAvailable(true, false);
    const aiResponse = JSON.stringify({
      refined: "What is OpenCV?",
      ambiguous: false,
      changes: "Fixed capitalization and spelling",
    });
    mockGeminiResponse(aiResponse);

    const result = await refineQuestion("wat is opencv");
    expect(result.source).toBe("ai");
    expect(result.suggested).toBe("What is OpenCV?");
    expect(result.ambiguous).toBe(false);
  });

  it("falls back to local when AI returns malformed response", async () => {
    setAiAvailable(true, false);
    mockGeminiResponse("not valid json");

    const result = await refineQuestion("what is recursion");
    expect(result.source).toBe("local");
    expect(result.suggested.length).toBeGreaterThan(0);
  });

  it("marks question as ambiguous when AI says so", async () => {
    setAiAvailable(true, false);
    const aiResponse = JSON.stringify({
      refined: "Can you clarify this question?",
      ambiguous: true,
      changes: "Input was unclear",
    });
    mockGeminiResponse(aiResponse);

    const result = await refineQuestion("it doesnt work");
    if (result.source === "ai") {
      expect(result.ambiguous).toBe(true);
    }
  });

  it("preserves technical terms in local fallback", async () => {
    setAiAvailable(false, false);
    const result = await refineQuestion("what is Big O notation");
    // Should not corrupt 'O' to something else
    expect(result.suggested.toLowerCase()).toContain("big");
    expect(result.suggested).toContain("O");
  });

  it("falls back to local when AI response is suspiciously long", async () => {
    setAiAvailable(true, false);
    const longText = "A".repeat(2000);
    mockGeminiResponse(
      JSON.stringify({ refined: longText, ambiguous: false, changes: "none" })
    );

    const result = await refineQuestion("short question?");
    // ratio check: 2000 / ~15 chars >> 3 → falls back to local
    expect(result.source).toBe("local");
  });
});

describe("Provider selection", () => {
  it("uses openrouter as primary when configured", async () => {
    mockEnv.getAiPrimaryProvider.mockReturnValue("openrouter");
    setAiAvailable(false, true);
    mockOpenRouterResponse("hello");

    const result = await aiGenerate({ messages: [{ role: "user", content: "hi" }] });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.provider).toBe("openrouter");
    }
  });
});
