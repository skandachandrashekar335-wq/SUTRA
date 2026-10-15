/**
 * Tests for document extraction, chunking, and RAG answer generation.
 * All AI calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock AI provider ─────────────────────────────────────────────────────────

vi.mock("@/lib/ai/provider", () => ({
  aiGenerate: vi.fn(),
  aiGenerateJson: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getFeatureAvailability: vi.fn(() => ({
    supabase: false,
    gemini: false,
    openRouter: false,
    aiAvailable: false,
    scheduler: false,
  })),
  getGeminiApiKey: vi.fn(() => undefined),
  getOpenRouterApiKey: vi.fn(() => undefined),
  getAiPrimaryProvider: vi.fn(() => "gemini"),
  getAiRequestTimeoutMs: vi.fn(() => 5000),
  getAiMaxRetries: vi.fn(() => 0),
  getGeminiModel: vi.fn(() => "gemini-1.5-flash"),
  getOpenRouterModel: vi.fn(() => "mistralai/mistral-7b-instruct:free"),
  getOpenRouterBaseUrl: vi.fn(() => "https://openrouter.ai/api/v1"),
  getSchedulerSecret: vi.fn(() => undefined),
}));

import { aiGenerateJson } from "@/lib/ai/provider";
import * as envModule from "@/lib/env";

const mockAiGenerateJson = vi.mocked(aiGenerateJson);
const mockEnv = vi.mocked(envModule);

import {
  detectMimeFromFilename,
  chunkText,
  rankChunksByRelevance,
  type ExtractionSection,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/ai/document-extractor";
import { generateRagAnswer } from "@/lib/ai/rag-answer";
import type { TextChunk } from "@/lib/ai/document-extractor";

// ─── detectMimeFromFilename ───────────────────────────────────────────────────

describe("detectMimeFromFilename", () => {
  it("detects PDF", () => {
    expect(detectMimeFromFilename("lecture.pdf")).toBe("application/pdf");
  });

  it("detects DOCX", () => {
    expect(detectMimeFromFilename("notes.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });

  it("detects PPTX", () => {
    expect(detectMimeFromFilename("slides.pptx")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
  });

  it("detects TXT", () => {
    expect(detectMimeFromFilename("notes.txt")).toBe("text/plain");
  });

  it("returns null for unsupported extension", () => {
    expect(detectMimeFromFilename("image.png")).toBeNull();
    expect(detectMimeFromFilename("data.csv")).toBeNull();
    expect(detectMimeFromFilename("archive.zip")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(detectMimeFromFilename("LECTURE.PDF")).toBe("application/pdf");
    expect(detectMimeFromFilename("Notes.DOCX")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
  });

  it("handles filenames with multiple dots", () => {
    expect(detectMimeFromFilename("lecture.notes.v2.pdf")).toBe("application/pdf");
  });
});

// ─── chunkText ────────────────────────────────────────────────────────────────

describe("chunkText", () => {
  it("returns single chunk for short section", () => {
    const sections: ExtractionSection[] = [
      { ref: "page 1", text: "The mean is the average of a set of numbers." },
    ];
    const chunks = chunkText(sections);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].sourceRef).toBe("page 1");
    expect(chunks[0].text).toContain("mean");
  });

  it("splits long section into overlapping chunks", () => {
    const longText = "A".repeat(2500);
    const sections: ExtractionSection[] = [{ ref: "page 1", text: longText }];
    const chunks = chunkText(sections);
    expect(chunks.length).toBeGreaterThan(1);
    // Chunks should overlap
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThan(0);
      expect(chunk.text.length).toBeLessThanOrEqual(2500);
    }
  });

  it("assigns sequential index across sections", () => {
    const sections: ExtractionSection[] = [
      { ref: "page 1", text: "First page content." },
      { ref: "page 2", text: "Second page content." },
    ];
    const chunks = chunkText(sections);
    expect(chunks[0].index).toBe(0);
    expect(chunks[1].index).toBe(1);
  });

  it("preserves sourceRef from section", () => {
    const sections: ExtractionSection[] = [
      { ref: "slide 5", text: "Slide content about recursion." },
    ];
    const chunks = chunkText(sections);
    expect(chunks[0].sourceRef).toBe("slide 5");
  });

  it("handles empty sections list", () => {
    expect(chunkText([])).toHaveLength(0);
  });
});

// ─── rankChunksByRelevance ────────────────────────────────────────────────────

describe("rankChunksByRelevance", () => {
  const chunks: TextChunk[] = [
    { text: "The mean is the average value of numbers in a dataset.", sourceRef: "page 1", index: 0 },
    { text: "Standard deviation measures the spread of data.", sourceRef: "page 2", index: 1 },
    { text: "The median is the middle value when data is sorted.", sourceRef: "page 3", index: 2 },
    { text: "Recursion is when a function calls itself.", sourceRef: "page 4", index: 3 },
    { text: "Mode is the most frequently occurring value.", sourceRef: "page 5", index: 4 },
  ];

  it("returns most relevant chunks for query", () => {
    const results = rankChunksByRelevance(chunks, "what is mean average", 3);
    expect(results.length).toBeGreaterThan(0);
    // The mean/average chunk should rank higher
    const texts = results.map((c) => c.text);
    expect(texts.some((t) => t.toLowerCase().includes("mean"))).toBe(true);
  });

  it("returns at most topK results", () => {
    const results = rankChunksByRelevance(chunks, "data statistics", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("returns empty array when no chunks match", () => {
    const results = rankChunksByRelevance(chunks, "quantum physics neutron stars");
    expect(results).toHaveLength(0);
  });

  it("keeps chunks that share keywords with query", () => {
    const results = rankChunksByRelevance(chunks, "recursion function", 5);
    expect(results.some((c) => c.text.includes("Recursion"))).toBe(true);
  });
});

// ─── RAG Answer ───────────────────────────────────────────────────────────────

describe("generateRagAnswer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sampleChunks: TextChunk[] = [
    { text: "The mean is the sum divided by the count of values.", sourceRef: "page 1", index: 0 },
    { text: "Standard deviation = sqrt(variance).", sourceRef: "page 2", index: 1 },
  ];

  it("returns ai_unavailable when no provider is configured", async () => {
    mockEnv.getFeatureAvailability.mockReturnValue({
      supabase: false, gemini: false, openRouter: false, aiAvailable: false, scheduler: false,
    });

    const result = await generateRagAnswer("What is the mean?", sampleChunks);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("ai_unavailable");
    }
  });

  it("returns no_relevant_chunks when chunks array is empty", async () => {
    mockEnv.getFeatureAvailability.mockReturnValue({
      supabase: false, gemini: true, openRouter: false, aiAvailable: true, scheduler: false,
    });

    const result = await generateRagAnswer("What is the mean?", []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_relevant_chunks");
    }
  });

  it("returns answer when AI provides sufficient evidence", async () => {
    mockEnv.getFeatureAvailability.mockReturnValue({
      supabase: false, gemini: true, openRouter: false, aiAvailable: true, scheduler: false,
    });

    mockAiGenerateJson.mockResolvedValue({
      result: {
        answer: "The mean is the sum divided by the count.",
        citations: [{ ref: "page 1", snippet: "The mean is the sum divided by the count." }],
        confidence: "high" as const,
        sufficient: true,
      },
      provider: "gemini",
      model: "gemini-1.5-flash",
    });

    const result = await generateRagAnswer("What is the mean?", sampleChunks);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.answer.answer).toContain("mean");
      expect(result.answer.citations).toHaveLength(1);
      expect(result.answer.citations[0].sourceRef).toBe("page 1");
    }
  });

  it("returns evidence_insufficient when AI says sufficient=false", async () => {
    mockEnv.getFeatureAvailability.mockReturnValue({
      supabase: false, gemini: true, openRouter: false, aiAvailable: true, scheduler: false,
    });

    mockAiGenerateJson.mockResolvedValue({
      result: {
        answer: "",
        citations: [],
        confidence: "low" as const,
        sufficient: false,
      },
      provider: "gemini",
      model: "gemini-1.5-flash",
    });

    const result = await generateRagAnswer("What is quantum entanglement?", sampleChunks);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("evidence_insufficient");
    }
  });

  it("validates citations — strips fabricated refs", async () => {
    mockEnv.getFeatureAvailability.mockReturnValue({
      supabase: false, gemini: true, openRouter: false, aiAvailable: true, scheduler: false,
    });

    mockAiGenerateJson.mockResolvedValue({
      result: {
        answer: "The mean is calculated as sum / count.",
        citations: [
          { ref: "page 1", snippet: "sum divided by count" }, // valid
          { ref: "page 99", snippet: "fabricated page" }, // invalid — not in chunks
        ],
        confidence: "high" as const,
        sufficient: true,
      },
      provider: "gemini",
      model: "gemini-1.5-flash",
    });

    const result = await generateRagAnswer("What is mean?", sampleChunks);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Only page 1 should remain (page 99 is fabricated)
      const refs = result.answer.citations.map((c) => c.sourceRef);
      expect(refs).toContain("page 1");
      expect(refs).not.toContain("page 99");
    }
  });

  it("returns ai_unavailable when aiGenerateJson returns error", async () => {
    mockEnv.getFeatureAvailability.mockReturnValue({
      supabase: false, gemini: true, openRouter: false, aiAvailable: true, scheduler: false,
    });

    mockAiGenerateJson.mockResolvedValue({
      ok: false,
      error: "Provider failed",
      code: "provider_error" as const,
      retryable: false,
    });

    const result = await generateRagAnswer("What is mean?", sampleChunks);
    expect(result.ok).toBe(false);
  });
});

// ─── File size limit ─────────────────────────────────────────────────────────

describe("MAX_FILE_SIZE_BYTES", () => {
  it("is 10 MB", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});
