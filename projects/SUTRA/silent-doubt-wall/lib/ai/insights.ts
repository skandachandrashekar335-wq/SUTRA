/**
 * SUTRA — AI Teacher Insights Service
 *
 * Generates teacher-only summaries and insights from real lecture data.
 * Never invents statistics — counts come from the database.
 * Clearly distinguishes measured facts from AI interpretation.
 */

import { aiGenerateJson } from "@/lib/ai/provider";
import { getFeatureAvailability } from "@/lib/env";
import type { DoubtGroup } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LectureStats {
  totalDoubts: number;
  approvedDoubts: number;
  needsReviewDoubts: number;
  rejectedDoubts: number;
  totalGroups: number;
  totalVotes: number;
  topGroups: DoubtGroup[];
}

export interface TeacherInsights {
  /** Factual, DB-derived statistics */
  stats: LectureStats;
  /** AI-generated sections — undefined if AI unavailable */
  ai?: {
    confusionSummary: string;
    topicClusters: string[];
    teachingRecommendations: string[];
    unansweredHighPriority: string[];
  };
  aiProvider?: string;
  aiModel?: string;
  generatedAt: string;
}

interface InsightsResponse {
  confusionSummary: string;
  topicClusters: string[];
  teachingRecommendations: string[];
  unansweredHighPriority: string[];
}

function isInsightsResponse(v: unknown): v is InsightsResponse {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.confusionSummary === "string" &&
    Array.isArray(r.topicClusters) &&
    Array.isArray(r.teachingRecommendations) &&
    Array.isArray(r.unansweredHighPriority)
  );
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildInsightsPrompt(groups: DoubtGroup[], stats: LectureStats): string {
  const groupLines = groups
    .map(
      (g, i) =>
        `${i + 1}. "${g.canonical_question}" — ${g.vote_count} votes, ${g.total_submissions} submissions`
    )
    .join("\n");

  return `You are an academic analyst helping a teacher understand classroom confusion.

The teacher has just finished a lecture. Here is the anonymized question data:

Total questions submitted: ${stats.totalDoubts}
Approved questions: ${stats.approvedDoubts}
Total confusion groups: ${stats.totalGroups}
Total "Me too" votes: ${stats.totalVotes}

Top question groups by votes:
${groupLines || "(no questions yet)"}

Based ONLY on the above data (do not invent information not present above):
1. Write a short summary (2-3 sentences) of where students are most confused.
2. Identify topic clusters — areas of confusion that appear repeatedly.
3. Give 2-3 specific, actionable teaching recommendations.
4. List the top 3 high-priority unanswered questions (quoted from the list above).

Respond with ONLY a JSON object in this exact shape:
{
  "confusionSummary": "<2-3 sentence summary>",
  "topicClusters": ["<topic 1>", "<topic 2>"],
  "teachingRecommendations": ["<recommendation 1>", "<recommendation 2>"],
  "unansweredHighPriority": ["<question 1>", "<question 2>", "<question 3>"]
}`;
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function generateTeacherInsights(
  groups: DoubtGroup[],
  stats: LectureStats
): Promise<TeacherInsights> {
  const base: TeacherInsights = {
    stats,
    generatedAt: new Date().toISOString(),
  };

  const features = getFeatureAvailability();
  if (!features.aiAvailable || groups.length === 0) {
    return base;
  }

  const result = await aiGenerateJson(
    {
      messages: [{ role: "user", content: buildInsightsPrompt(groups, stats) }],
      maxOutputTokens: 512,
      temperature: 0.3,
    },
    isInsightsResponse
  );

  if (!("result" in result)) {
    // AI unavailable — return stats-only insights
    return base;
  }

  return {
    ...base,
    ai: result.result,
    aiProvider: result.provider,
    aiModel: result.model,
  };
}
