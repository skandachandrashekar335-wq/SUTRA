"use client";

import { useState, useEffect, use, Suspense, useRef } from "react";
import { SiteNav, Button, Textarea, Alert, EmptyState } from "@/components/ui";
import { getOrCreateSessionToken } from "@/lib/utils";
import { submitDoubtSchema } from "@/lib/validation";
import { MAX_DOUBT_LENGTH, MIN_DOUBT_LENGTH } from "@/lib/types";

interface DoubtItem {
  id: string;
  text: string;
  votes: number;
  hasVoted: boolean;
  timeAgo: string;
  status: "approved" | "pending" | "needs_review";
  isMySubmission?: boolean;
}

interface RefineResult {
  suggested: string;
  source: "ai" | "local";
  ambiguous?: boolean;
  explanation?: string;
}

interface AiAnswerState {
  loading: boolean;
  answered: boolean;
  answer?: string;
  citations?: Array<{ sourceRef: string; snippet: string }>;
  confidence?: string;
  reason?: string;
  message?: string;
  error?: string;
  questionText?: string;
}

const INITIAL_APPROVED_QUESTIONS: DoubtItem[] = [
  {
    id: "q-1",
    text: "What is the difference between arithmetic mean and average?",
    votes: 14,
    hasVoted: false,
    timeAgo: "15m ago",
    status: "approved",
  },
  {
    id: "q-2",
    text: "How do we calculate mode in grouped data when class sizes are unequal?",
    votes: 9,
    hasVoted: false,
    timeAgo: "12m ago",
    status: "approved",
  },
  {
    id: "q-3",
    text: "Why is the median unaffected by extreme outliers in skewed distributions?",
    votes: 7,
    hasVoted: true,
    timeAgo: "8m ago",
    status: "approved",
  },
  {
    id: "q-4",
    text: "Can a dataset have more than two modes?",
    votes: 3,
    hasVoted: false,
    timeAgo: "4m ago",
    status: "approved",
  },
];

// ── AI Refine Suggestion Panel ─────────────────────────────────────────────

function RefineSuggestion({
  original,
  result,
  onAccept,
  onDismiss,
}: {
  original: string;
  result: RefineResult;
  onAccept: (text: string) => void;
  onDismiss: () => void;
}) {
  const isChanged = result.suggested.trim().toLowerCase() !== original.trim().toLowerCase();

  if (!isChanged) {
    return (
      <div className="rounded-xl border border-teal/30 bg-teal-light/10 p-3 text-sm text-teal-dark flex items-start gap-2">
        <svg className="w-4 h-4 mt-0.5 shrink-0 text-teal" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L15 7" />
        </svg>
        <span>Your question looks clear! No improvements needed.</span>
        <button onClick={onDismiss} className="ml-auto text-ink-faint hover:text-ink text-xs underline shrink-0">Dismiss</button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-teal/30 bg-teal-light/10 p-3.5 space-y-2.5" role="region" aria-label="AI suggestion">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-teal flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {result.source === "ai" ? "AI Suggestion" : "Auto-corrected"}
        </span>
        <button onClick={onDismiss} className="text-ink-faint hover:text-ink text-xs" aria-label="Dismiss suggestion">✕</button>
      </div>

      {result.ambiguous && (
        <p className="text-xs text-amber-dark bg-amber-light/60 rounded px-2.5 py-1.5">
          Your question may be ambiguous. Review the suggestion carefully.
        </p>
      )}

      <p className="text-sm text-ink font-medium leading-relaxed bg-paper rounded-lg border border-border px-3 py-2.5 italic">
        &ldquo;{result.suggested}&rdquo;
      </p>

      {result.explanation && (
        <p className="text-[11px] text-ink-faint">{result.explanation}</p>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="primary"
          onClick={() => onAccept(result.suggested)}
          className="flex-1 sm:flex-none"
        >
          Use this version
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDismiss}
        >
          Keep original
        </Button>
      </div>
    </div>
  );
}

// ── AI Answer Panel ────────────────────────────────────────────────────────

function AiAnswerPanel({
  state,
  onClose,
}: {
  state: AiAnswerState;
  onClose: () => void;
}) {
  if (state.loading) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 space-y-2" role="status" aria-live="polite">
        <div className="flex items-center gap-2 text-sm text-ink-subtle">
          <span className="inline-block w-4 h-4 border-2 border-teal border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          Searching lecture notes for an answer…
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-xl border border-rose/20 bg-rose-light/30 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-rose">{state.error}</p>
          <button onClick={onClose} className="text-ink-faint hover:text-ink text-xs shrink-0" aria-label="Close">✕</button>
        </div>
      </div>
    );
  }

  if (!state.answered) {
    return (
      <div className="rounded-xl border border-border bg-surface/80 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-ink-subtle mb-0.5">No answer found in lecture notes</p>
            <p className="text-xs text-ink-faint">{state.message ?? "Your teacher hasn't uploaded relevant documents yet."}</p>
          </div>
          <button onClick={onClose} className="text-ink-faint hover:text-ink text-xs shrink-0" aria-label="Close">✕</button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-teal/25 bg-teal-light/10 p-4 space-y-3" role="region" aria-label="AI answer from lecture notes">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-teal flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6-4h6m2 5.5a2 2 0 01-2 2H7a2 2 0 01-2-2V7a2 2 0 012-2h5l4 4v6.5z" />
          </svg>
          Answer from Lecture Notes
        </span>
        <div className="flex items-center gap-2">
          {state.confidence && (
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              state.confidence === "high" ? "bg-emerald-light text-emerald" :
              state.confidence === "medium" ? "bg-amber-light text-amber-dark" :
              "bg-surface text-ink-faint"
            }`}>
              {state.confidence} confidence
            </span>
          )}
          <button onClick={onClose} className="text-ink-faint hover:text-ink text-xs" aria-label="Close answer">✕</button>
        </div>
      </div>

      <p className="text-sm text-ink leading-relaxed">{state.answer}</p>

      {state.citations && state.citations.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-mono text-ink-faint uppercase tracking-wider">Sources</p>
          {state.citations.map((c, i) => (
            <div key={i} className="text-xs bg-paper border border-border rounded-lg px-3 py-2">
              <span className="font-mono text-teal text-[10px] uppercase mr-2">{c.sourceRef}</span>
              <span className="text-ink-subtle italic">&ldquo;{c.snippet}&rdquo;</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-ink-faint border-t border-border/60 pt-2">
        AI-generated from your teacher&apos;s uploaded lecture notes. Verify with your teacher for important decisions.
      </p>
    </div>
  );
}


function StudentDoubtFeedContent({
  params,
}: {
  params: Promise<{ lectureId: string }>;
}) {
  const resolvedParams = use(params);
  const lectureId = resolvedParams.lectureId;

  const [sessionToken] = useState(() => {
    if (typeof window !== "undefined") {
      return getOrCreateSessionToken();
    }
    return "";
  });
  const [lectureInfo, setLectureInfo] = useState<{
    title: string;
    subject: string;
    section?: string;
    status: string;
  }>(() => {
    if (lectureId.startsWith("preview-")) {
      return { title: "Measures of Central Tendency", subject: "Statistics", status: "live" };
    }
    return { title: "", subject: "", status: "live" };
  });

  const [questions, setQuestions] = useState<DoubtItem[]>(() =>
    lectureId.startsWith("preview-") ? INITIAL_APPROVED_QUESTIONS : []
  );
  const [newDoubtText, setNewDoubtText] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionFeedback, setSubmissionFeedback] = useState<{
    type: "success" | "pending" | "info" | "error";
    message: string;
  } | null>(null);

  // AI refiner state
  const [refineState, setRefineState] = useState<{
    loading: boolean;
    result: RefineResult | null;
    originalText: string;
  }>({ loading: false, result: null, originalText: "" });

  // AI answer state (per question)
  const [aiAnswerStates, setAiAnswerStates] = useState<Map<string, AiAnswerState>>(new Map());

  // Debounce ref to avoid rapid refine calls
  const refineDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll lecture details and doubts
  useEffect(() => {
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    async function fetchStream() {
      try {
        const lecRes = await fetch(`/api/lectures/${lectureId}`);
        if (lecRes.ok) {
          const lecJson = await lecRes.json();
          if (lecJson.ok && !cancelled) {
            const status = lecJson.data.lecture.status;
            setLectureInfo({
              title: lecJson.data.lecture.title,
              subject: lecJson.data.lecture.subject,
              section: lecJson.data.lecture.section,
              status,
            });
            if (status === "ended" && pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
              return;
            }
          }
        }

        const doubtsRes = await fetch(
          `/api/doubts?lectureId=${lectureId}&sessionToken=${encodeURIComponent(sessionToken)}`
        );
        if (doubtsRes.ok) {
          const doubtsJson = await doubtsRes.json();
          if (doubtsJson.ok && !cancelled && doubtsJson.data.groups) {
            const mapped: DoubtItem[] = doubtsJson.data.groups.map(
              (g: { id: string; canonical_question: string; vote_count: number; created_at: string }) => ({
                id: g.id,
                text: g.canonical_question,
                votes: g.vote_count,
                hasVoted: false,
                timeAgo: "active",
                status: "approved",
                isMySubmission: false,
              })
            );
            if (mapped.length > 0) {
              setQuestions((prev) => {
                const votedMap = new Map(prev.map((p) => [p.id, p.hasVoted]));
                return mapped.map((m) => ({
                  ...m,
                  hasVoted: votedMap.get(m.id) ?? false,
                }));
              });
            }
          }
        }
      } catch {
        // keep polling on network errors
      }
    }

    fetchStream();
    pollInterval = setInterval(fetchStream, 4000);
    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [lectureId, sessionToken]);

  // ── AI Refine ─────────────────────────────────────────────────────────────

  async function handleRefine() {
    const text = newDoubtText.trim();
    if (text.length < MIN_DOUBT_LENGTH) return;

    setRefineState({ loading: true, result: null, originalText: text });

    try {
      const res = await fetch("/api/ai/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (json.ok && json.data) {
        setRefineState({ loading: false, result: json.data, originalText: text });
      } else {
        setRefineState({ loading: false, result: null, originalText: text });
      }
    } catch {
      setRefineState({ loading: false, result: null, originalText: text });
    }
  }

  function handleAcceptRefinement(suggested: string) {
    setNewDoubtText(suggested);
    setRefineState({ loading: false, result: null, originalText: "" });
  }

  function handleDismissRefinement() {
    setRefineState({ loading: false, result: null, originalText: "" });
  }

  // ── AI Answer ─────────────────────────────────────────────────────────────

  async function handleRequestAnswer(questionId: string, questionText: string) {
    setAiAnswerStates((prev) => new Map(prev).set(questionId, {
      loading: true, answered: false, questionText,
    }));

    try {
      const res = await fetch("/api/ai/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lectureId, question: questionText }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setAiAnswerStates((prev) => new Map(prev).set(questionId, {
          loading: false,
          answered: false,
          error: json.error ?? "Failed to get an answer. Try again later.",
          questionText,
        }));
        return;
      }

      const data = json.data;
      if (data.answered) {
        setAiAnswerStates((prev) => new Map(prev).set(questionId, {
          loading: false,
          answered: true,
          answer: data.answer?.answer,
          citations: data.answer?.citations,
          confidence: data.answer?.confidence,
          questionText,
        }));
      } else {
        setAiAnswerStates((prev) => new Map(prev).set(questionId, {
          loading: false,
          answered: false,
          reason: data.reason,
          message: data.message,
          questionText,
        }));
      }
    } catch {
      setAiAnswerStates((prev) => new Map(prev).set(questionId, {
        loading: false,
        answered: false,
        error: "Network error. Please try again.",
        questionText,
      }));
    }
  }

  function handleCloseAnswer(questionId: string) {
    setAiAnswerStates((prev) => {
      const next = new Map(prev);
      next.delete(questionId);
      return next;
    });
  }

  // ── Submit Doubt ─────────────────────────────────────────────────────────

  async function handleSubmitDoubt(e: React.FormEvent) {
    e.preventDefault();
    setComposerError(null);
    setSubmissionFeedback(null);

    if (lectureInfo.status === "ended") {
      setComposerError("This lecture has ended. New doubts cannot be submitted.");
      return;
    }

    const validation = submitDoubtSchema.safeParse({
      text: newDoubtText,
      lecture_id: lectureId.startsWith("preview-")
        ? "00000000-0000-0000-0000-000000000000"
        : lectureId,
      session_token: sessionToken || "anonymous-session",
    });

    if (!validation.success) {
      setComposerError(validation.error.issues[0]?.message ?? "Please enter a valid doubt.");
      return;
    }

    setIsSubmitting(true);
    // Clear any pending refinement when submitting
    setRefineState({ loading: false, result: null, originalText: "" });

    try {
      const res = await fetch("/api/doubts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lecture_id: lectureId,
          text: newDoubtText.trim(),
          session_token: sessionToken || "anonymous-session",
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setComposerError(json.error || "Submission could not be accepted.");
        setIsSubmitting(false);
        return;
      }

      const moderationStatus: string = json.data?.moderationStatus ?? "approved";

      if (moderationStatus === "needs_review") {
        setNewDoubtText("");
        setSubmissionFeedback({
          type: "pending",
          message: "Your question was received and is waiting for teacher review before it appears in the class feed.",
        });
      } else {
        const newQuestion: DoubtItem = {
          id: json.data.groupId || `my-${Date.now()}`,
          text: json.data.text,
          votes: 1,
          hasVoted: true,
          timeAgo: "just now",
          status: "approved",
          isMySubmission: true,
        };
        setQuestions((prev) => [newQuestion, ...prev.filter((p) => p.id !== newQuestion.id)]);
        setNewDoubtText("");
        setSubmissionFeedback({
          type: "success",
          message: "Your question was submitted anonymously! It is now visible to the class.",
        });
      }
    } catch {
      setComposerError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Vote ──────────────────────────────────────────────────────────────────

  async function handleVoteToggle(id: string) {
    const target = questions.find((q) => q.id === id);
    if (!target) return;
    const nextVoted = !target.hasVoted;

    setQuestions((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, hasVoted: nextVoted, votes: nextVoted ? item.votes + 1 : Math.max(0, item.votes - 1) }
          : item
      )
    );

    try {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          group_id: id.startsWith("my-") || id.startsWith("q-") ? "00000000-0000-0000-0000-000000000001" : id,
          session_token: sessionToken || "anonymous-session",
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && typeof json.data.voteCount === "number") {
          setQuestions((prev) =>
            prev.map((item) => (item.id === id ? { ...item, votes: json.data.voteCount } : item))
          );
        }
      }
    } catch {
      setQuestions((prev) =>
        prev.map((item) => (item.id === id ? { ...item, hasVoted: !nextVoted } : item))
      );
    }
  }

  // Suppress debounce ref warning
  void refineDebounce;

  return (
    <>
      <SiteNav />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            {lectureInfo.status === "ended" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-ink-faint" />
                <span className="text-xs font-mono font-medium uppercase tracking-wider text-ink-faint">
                  LECTURE ENDED
                </span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-amber live-dot" />
                <span className="text-xs font-mono font-medium uppercase tracking-wider text-amber-dark">
                  LIVE CLASSROOM
                </span>
              </>
            )}
            <span className="text-xs text-ink-faint">• 100% Anonymous</span>
          </div>

          <h1 className="font-display text-2xl sm:text-3xl text-ink">
            {lectureInfo.title || "Classroom Lecture"}
          </h1>
          <p className="text-xs sm:text-sm text-ink-subtle mt-1">
            {lectureInfo.subject && `${lectureInfo.subject}${lectureInfo.section ? ` · ${lectureInfo.section}` : ""} • `}Don&apos;t understand something? Ask below or agree with existing doubts.
          </p>
        </div>

        {/* ── Composer (hidden when ended) ────────────────────────────────── */}
        {lectureInfo.status === "ended" ? (
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 mb-8 text-center">
            <p className="text-sm font-medium text-ink mb-1">This lecture has ended.</p>
            <p className="text-xs text-ink-subtle">New questions can no longer be submitted.</p>
          </div>
        ) : (
          <section aria-label="Ask a doubt" className="rounded-2xl border border-border bg-paper p-5 sm:p-6 shadow-xs mb-8 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-teal" />
                Ask an Anonymous Question
              </h2>
              <span className="text-[11px] font-mono text-ink-faint">No names attached</span>
            </div>

            {submissionFeedback && (
              <Alert type={submissionFeedback.type === "pending" ? "info" : submissionFeedback.type === "error" ? "error" : "success"}>
                {submissionFeedback.message}
              </Alert>
            )}

            <form onSubmit={handleSubmitDoubt} noValidate className="space-y-3">
              <Textarea
                label="Your Academic Doubt"
                placeholder="e.g. Why do we divide by n-1 instead of n in sample standard deviation?"
                value={newDoubtText}
                onChange={(e) => {
                  setNewDoubtText(e.target.value);
                  // Clear stale refinement if user changes text significantly
                  if (refineState.result && Math.abs(e.target.value.length - refineState.originalText.length) > 10) {
                    setRefineState({ loading: false, result: null, originalText: "" });
                  }
                }}
                error={composerError ?? undefined}
                charLimit={MAX_DOUBT_LENGTH}
                currentLength={newDoubtText.length}
                rows={3}
                className="text-base sm:text-sm"
                hint="Be specific. Related questions are grouped together so your teacher can explain them."
              />

              {/* AI Refinement result */}
              {refineState.result && (
                <RefineSuggestion
                  original={refineState.originalText}
                  result={refineState.result}
                  onAccept={handleAcceptRefinement}
                  onDismiss={handleDismissRefinement}
                />
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[11px] text-ink-faint">
                    Min {MIN_DOUBT_LENGTH} characters.
                  </p>
                  {/* Improve with AI button */}
                  {newDoubtText.trim().length >= MIN_DOUBT_LENGTH && !refineState.result && (
                    <button
                      type="button"
                      onClick={handleRefine}
                      disabled={refineState.loading}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-teal hover:text-teal-dark disabled:opacity-50 transition-colors"
                      aria-label="Improve question with AI"
                    >
                      {refineState.loading ? (
                        <>
                          <span className="inline-block w-3 h-3 border border-teal border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                          Improving…
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 2L3 14m0 0l4-1-3-3m3 4L10 3" />
                          </svg>
                          Improve with AI
                        </>
                      )}
                    </button>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={isSubmitting}
                  disabled={newDoubtText.trim().length < MIN_DOUBT_LENGTH}
                  className="w-full sm:w-auto"
                >
                  Submit Doubt
                </Button>
              </div>
            </form>
          </section>
        )}

        {/* ── Feed ────────────────────────────────────────────────────────── */}
        <section aria-label="Classroom doubts feed">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
            <h2 className="text-xs font-mono uppercase tracking-wider font-semibold text-ink-subtle">
              Classroom Doubts ({questions.length})
            </h2>
            <span className="text-xs text-ink-faint">
              Tap &ldquo;Me too&rdquo; if you have the same question
            </span>
          </div>

          {questions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 bg-surface/40">
              <EmptyState
                title="No questions asked yet"
                description="Be the first to post a doubt. Your question is completely anonymous."
              />
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q) => {
                const answerState = aiAnswerStates.get(q.id);
                return (
                  <article
                    key={q.id}
                    className={`p-4 sm:p-5 rounded-xl border transition-all ${
                      q.isMySubmission
                        ? "border-teal/30 bg-teal-light/20"
                        : "border-border bg-paper hover:border-border-strong"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {q.isMySubmission && (
                            <span className="text-[10px] font-mono uppercase bg-teal text-white px-2 py-0.5 rounded-full font-medium">
                              Your Submission
                            </span>
                          )}
                          <span className="text-xs text-ink-faint font-mono">{q.timeAgo}</span>
                        </div>

                        <p className="text-sm sm:text-base text-ink font-normal leading-relaxed">{q.text}</p>

                        {/* Ask AI button */}
                        {!answerState && (
                          <button
                            type="button"
                            onClick={() => handleRequestAnswer(q.id, q.text)}
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-faint hover:text-teal transition-colors"
                            aria-label={`Get AI answer for: ${q.text}`}
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 3v3l2 1" />
                            </svg>
                            Ask AI (from lecture notes)
                          </button>
                        )}

                        {/* AI answer panel */}
                        {answerState && (
                          <AiAnswerPanel
                            state={answerState}
                            onClose={() => handleCloseAnswer(q.id)}
                          />
                        )}
                      </div>

                      {/* Me Too Button */}
                      <button
                        type="button"
                        onClick={() => handleVoteToggle(q.id)}
                        aria-pressed={q.hasVoted}
                        className={`min-h-[44px] min-w-[76px] px-3 py-2 rounded-xl border flex flex-col items-center justify-center transition-all shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal ${
                          q.hasVoted
                            ? "bg-teal text-white border-teal shadow-xs font-semibold"
                            : "bg-surface border-border text-ink hover:bg-surface-2"
                        }`}
                      >
                        <span className="text-xs font-medium leading-none flex items-center gap-1">
                          <svg
                            viewBox="0 0 16 16"
                            className={`w-3.5 h-3.5 ${q.hasVoted ? "fill-white" : "fill-none stroke-current"}`}
                            strokeWidth="1.5"
                            aria-hidden="true"
                          >
                            <path d="M8 3.5l3.5 4.5h-2.5v4.5h-2v-4.5h-2.5L8 3.5z" />
                          </svg>
                          {q.hasVoted ? "Me too!" : "Me too"}
                        </span>
                        <span className={`text-[11px] font-mono mt-0.5 ${q.hasVoted ? "text-teal-light" : "text-ink-faint"}`}>
                          {q.votes}
                        </span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="mt-12 pt-6 border-t border-border text-center">
          <p className="text-xs text-ink-faint">
            SUTRA • Anonymous classroom intelligence • Nothing links your name to this lecture
          </p>
        </footer>
      </main>
    </>
  );
}

export default function StudentDoubtFeedPage(props: {
  params: Promise<{ lectureId: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <StudentDoubtFeedContent params={props.params} />
    </Suspense>
  );
}
