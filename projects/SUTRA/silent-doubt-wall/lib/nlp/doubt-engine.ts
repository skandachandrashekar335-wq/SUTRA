/**
 * SUTRA — Doubt Intelligence Engine
 *
 * Local rule-based NLP pipeline:
 * 1. Text Normalization: Cleans typos, whitespace, and punctuation without altering academic meaning.
 * 2. Moderation: Filters abuse/profanity/harassment into 'rejected', ambiguous into 'needs_review', and safe into 'approved'.
 * 3. Semantic Grouping: Clusters genuinely equivalent questions while keeping distinct concepts separate.
 * 4. Pedagogical Explanation Suggestions: Generates actionable re-explanation hints for teachers.
 */

import type { ModerationStatus } from "@/lib/types";

// ─── 1. Text Normalization ───────────────────────────────────────────────────

/**
 * Common student academic typos and shorthand dictionary.
 * Maps harmless misspellings to correct academic spelling.
 */
const COMMON_TYPOS: Record<string, string> = {
  formla: "formula",
  formual: "formula",
  differnce: "difference",
  diffrence: "difference",
  calcuate: "calculate",
  calulate: "calculate",
  claculate: "calculate",
  averge: "average",
  avrage: "average",
  avg: "average",
  stastistics: "statistics",
  statitics: "statistics",
  distributon: "distribution",
  distrubution: "distribution",
  standrd: "standard",
  devation: "deviation",
  deviaton: "deviation",
  coeff: "coefficient",
  probablity: "probability",
  probabilty: "probability",
  hypotesis: "hypothesis",
  hypothisis: "hypothesis",
  theorum: "theorem",
  exmaple: "example",
  eqation: "equation",
  pls: "please",
  plz: "please",
  thx: "thanks",
  idk: "I don't understand",
  wrt: "with respect to",
};

/**
 * Cleans punctuation, whitespace, and obvious harmless typos.
 * Preserves math operators, variables, and academic semantics.
 */
export function cleanDoubtText(raw: string): string {
  if (!raw) return "";

  // 1. Normalize unicode whitespace and collapse multiple spaces
  let text = raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // Remove zero-width spaces
    .replace(/\s+/g, " ")
    .trim();

  // 2. Normalize question marks and exclamation points
  text = text.replace(/\?+/g, "?").replace(/!+/g, "!");

  // 3. Fix spacing before punctuation (e.g., "word ?" -> "word?")
  text = text.replace(/\s+([?,.!;:])/g, "$1");

  // 4. Token-level harmless typo correction (case-preserving for first char)
  const tokens = text.split(" ");
  const cleanedTokens = tokens.map((token) => {
    // Strip trailing punctuation for dictionary check
    const match = token.match(/^([a-zA-Z]+)([\?\.\,\!\;]*)$/);
    if (!match) return token;

    const [, word, punct] = match;
    const lower = word.toLowerCase();

    if (COMMON_TYPOS[lower]) {
      const replacement = COMMON_TYPOS[lower];
      // Preserve uppercase first letter if original had it
      const isCapitalized = word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase();
      const formatted = isCapitalized
        ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
        : replacement;
      return formatted + punct;
    }

    return token;
  });

  let result = cleanedTokens.join(" ");

  // 5. Ensure ends with punctuation if it's a question-like sentence
  if (!/[?.!]$/.test(result)) {
    result += "?";
  }

  // 6. Capitalize first letter of the sentence
  if (result.length > 0) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }

  return result;
}

// ─── 2. Baseline Moderation & Content Safety ──────────────────────────────────

/**
 * Severe abuse patterns (harassment, slurs, explicit toxicity).
 * Immediately marks submission as 'rejected'.
 */
const SEVERE_ABUSE_REGEX = /\b(fuck|shit|bitch|cunt|asshole|bastard|dick|pussy|whore|slut|kill\s+yourself|die)\b/i;

/**
 * Ambiguous patterns (profanity in academic context, suspicious frustration).
 * Marks submission as 'needs_review' rather than silently dropping.
 */
const SENSITIVE_REVIEW_REGEX = /\b(stupid|dumb|hate\s+this|sucks|nonsense|garbage|useless|cheat|leak)\b/i;

export interface ModerationResult {
  status: ModerationStatus;
  note: string | null;
}

/**
 * Evaluates whether a doubt is academically safe, requires review, or is clear abuse.
 * Never blocks legitimate academic terms (e.g. "regression", "discrimination", "kill process").
 */
export function moderateDoubt(text: string): ModerationResult {
  const normalized = text.toLowerCase();

  // Check for severe abuse
  if (SEVERE_ABUSE_REGEX.test(normalized)) {
    return {
      status: "rejected",
      note: "Violates classroom community guidelines (severe abusive language).",
    };
  }

  // Check for ambiguous frustration or potential disruption
  if (SENSITIVE_REVIEW_REGEX.test(normalized)) {
    return {
      status: "needs_review",
      note: "Submission flagged for teacher review due to sensitive wording.",
    };
  }

  // Gibberish / keyboard mash detection (e.g. "asdfghjk qwertyuiop")
  const words = text.split(/\s+/).filter(Boolean);
  const averageWordLength = words.reduce((acc, w) => acc + w.length, 0) / (words.length || 1);
  if (averageWordLength > 20 || (words.length === 1 && words[0].length > 25)) {
    return {
      status: "rejected",
      note: "Submission appears to be unreadable or keyboard mash.",
    };
  }

  return {
    status: "approved",
    note: null,
  };
}

// ─── 3. Semantic Grouping ─────────────────────────────────────────────────────

/**
 * English stop-words that carry minimal conceptual distinction.
 */
const STOP_WORDS = new Set([
  "a", "about", "an", "and", "are", "as", "at", "be", "by", "can", "could",
  "did", "do", "does", "explain", "for", "from", "had", "has", "have", "how",
  "i", "in", "is", "it", "me", "my", "of", "on", "or", "our", "please", "sir",
  "tell", "the", "their", "this", "to", "us", "was", "we", "what", "when",
  "where", "which", "who", "why", "will", "with", "would", "you", "your",
]);

/**
 * Core concept keywords and synonyms for equivalence clustering.
 * Synonyms within the same concept set are treated as equivalent.
 */
const SYNONYM_MAP: Record<string, string> = {
  average: "mean",
  mean: "mean",
  midpoint: "median",
  median: "median",
  spread: "dispersion",
  dispersion: "dispersion",
  variation: "dispersion",
  deviation: "dispersion",
  frequently: "mode",
  modal: "mode",
  mode: "mode",
  // "formula for X" and "calculate X" are semantically equivalent
  formula: "compute",
  calculate: "compute",
  compute: "compute",
  find: "compute",
  derive: "compute",
};

/**
 * Extract semantic concept signature from cleaned question text.
 */
export function extractConceptKeywords(text: string): {
  normalizedWords: Set<string>;
  distinguishingTerms: Set<string>;
  hasGroupedModifier: boolean;
} {
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 1 && !STOP_WORDS.has(t));

  const normalizedWords = new Set<string>();
  const distinguishingTerms = new Set<string>();

  let hasGroupedModifier = false;

  for (const token of tokens) {
    if (token === "grouped" || token === "continuous" || token === "intervals") {
      hasGroupedModifier = true;
    }

    const resolved = SYNONYM_MAP[token] ?? token;
    normalizedWords.add(resolved);

    // A token is a key discriminator if it resolves to (or IS) one of the
    // core statistical terms -- including synonyms like "average" → "mean".
    if (["mean", "median", "mode", "variance", "dispersion", "iqr", "range", "grouped"].includes(resolved)) {
      distinguishingTerms.add(resolved);
    }
  }

  return { normalizedWords, distinguishingTerms, hasGroupedModifier };
}

/**
 * Determines whether two doubts are genuinely equivalent in mathematical/academic context.
 *
 * Ground rules:
 * - "What is formula for mean?" and "How do we calculate average?" -> EQUIVALENT (mean = average, formula = calculate)
 * - "Formula for mean?" and "Formula for mode?" -> NOT EQUIVALENT (mean != mode)
 * - "Mode in grouped data?" and "Formula for mode?" -> NOT EQUIVALENT (grouped data requires specific formula)
 */
export function areDoubtsEquivalent(questionA: string, questionB: string): boolean {
  const a = extractConceptKeywords(questionA);
  const b = extractConceptKeywords(questionB);

  // 1. If distinguishing statistical terms differ (e.g. mean vs mode), NEVER merge
  for (const term of a.distinguishingTerms) {
    if (["mean", "median", "mode"].includes(term) && !b.distinguishingTerms.has(term)) {
      return false;
    }
  }
  for (const term of b.distinguishingTerms) {
    if (["mean", "median", "mode"].includes(term) && !a.distinguishingTerms.has(term)) {
      return false;
    }
  }

  // 2. "Grouped data" vs ungrouped must remain separate
  if (a.hasGroupedModifier !== b.hasGroupedModifier) {
    return false;
  }

  // 3. Jaccard similarity on normalized concept keywords
  const union = new Set([...a.normalizedWords, ...b.normalizedWords]);
  if (union.size === 0) return false;

  let intersectionCount = 0;
  for (const word of a.normalizedWords) {
    if (b.normalizedWords.has(word)) {
      intersectionCount++;
    }
  }

  const similarity = intersectionCount / union.size;

  // High confidence threshold for automatic clustering
  return similarity >= 0.5;
}

// ─── 4. Re-explanation Suggestions ───────────────────────────────────────────

/**
 * Generates an actionable, honest re-explanation tip for the teacher
 * based strictly on the canonical question topic.
 */
export function generateExplanationSuggestion(canonicalQuestion: string): string {
  const lower = canonicalQuestion.toLowerCase();

  if (lower.includes("mean") && (lower.includes("average") || lower.includes("diff"))) {
    return "Highlight that while 'average' in everyday speech refers to arithmetic mean, statistically it also encompasses median and mode. Give a 30-second concrete illustration using 5 sample test scores.";
  }

  if (lower.includes("mode") && lower.includes("grouped")) {
    return "Break down the grouped mode formula: Mode = L + [(f1 - f0) / (2f1 - f0 - f2)] * h. Emphasize how to identify the modal class by finding the maximum frequency first.";
  }

  if (lower.includes("median") && (lower.includes("outlier") || lower.includes("skew"))) {
    return "Contrast the median with the mean using an intuitive salary example: 9 workers earning $30k and 1 executive earning $1M. Show how median stays at $30k while mean is heavily pulled.";
  }

  if (lower.includes("standard deviation") || lower.includes("variance")) {
    return "Show the square-root relationship between variance and standard deviation. Explain that standard deviation returns dispersion into the original unit of measurement.";
  }

  if (lower.includes("formula")) {
    return "Write out the formula step-by-step on the board, define each variable explicitly, and walk through one simple worked numerical example.";
  }

  return "Address this core question with a quick concrete example and check for classroom consensus before moving on.";
}
