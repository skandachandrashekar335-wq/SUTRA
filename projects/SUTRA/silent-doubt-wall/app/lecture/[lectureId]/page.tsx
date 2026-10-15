"use client";

import { useState, useEffect, use, Suspense } from "react";
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
    // For preview routes, use demo defaults so the page renders without an API call.
    // For real lecture routes, start empty — the API fetch fills these in.
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

  // Poll lecture details and doubts stream
  useEffect(() => {
    let cancelled = false;

    let pollInterval: ReturnType<typeof setInterval> | null = null;

    async function fetchStream() {
      try {
        // Fetch lecture info
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
            // Stop polling once the lecture has ended — no new data will arrive
            if (status === "ended" && pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
              return;
            }
          }
        }

        // Fetch doubts and groups
        const doubtsRes = await fetch(
          `/api/doubts?lectureId=${lectureId}&sessionToken=${encodeURIComponent(sessionToken)}`
        );
        if (doubtsRes.ok) {
          const doubtsJson = await doubtsRes.json();
          if (doubtsJson.ok && !cancelled && doubtsJson.data.groups) {
            // Map groups to student feed items
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
                // Preserve local voted state
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
        // network error / offline — keep polling
      }
    }

    fetchStream();
    pollInterval = setInterval(fetchStream, 4000);
    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [lectureId, sessionToken]);

  // ── Submit Doubt ──────────────────────────────────────────────────────────

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
        // On rejection or server error: keep the composer input so the student
        // can edit and resubmit. Never optimistically add to the feed.
        setComposerError(json.error || "Submission could not be accepted.");
        setIsSubmitting(false);
        return;
      }

      const moderationStatus: string = json.data?.moderationStatus ?? "approved";

      if (moderationStatus === "needs_review") {
        // Held for teacher review — do NOT add to the visible class feed.
        // Clear the input and show an informational message.
        setNewDoubtText("");
        setSubmissionFeedback({
          type: "pending",
          message: "Your question was received and is waiting for teacher review before it appears in the class feed.",
        });
      } else {
        // approved — add to the local feed optimistically
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

  // ── "Me Too" Vote Interaction ─────────────────────────────────────────────

  async function handleVoteToggle(id: string) {
    const target = questions.find((q) => q.id === id);
    if (!target) return;

    const nextVoted = !target.hasVoted;

    // Optimistic UI update
    setQuestions((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            hasVoted: nextVoted,
            votes: nextVoted ? item.votes + 1 : Math.max(0, item.votes - 1),
          };
        }
        return item;
      })
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
      // Revert on network failure
      setQuestions((prev) =>
        prev.map((item) => (item.id === id ? { ...item, hasVoted: !nextVoted } : item))
      );
    }
  }

  return (
    <>
      <SiteNav />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-10">

        {/* ── Header: Lecture Context ─────────────────────────────────────── */}
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

        {/* ── Question Composer (hidden when lecture ended) ───────────────── */}
        {lectureInfo.status === "ended" ? (
          <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6 mb-8 text-center">
            <p className="text-sm font-medium text-ink mb-1">This lecture has ended.</p>
            <p className="text-xs text-ink-subtle">New questions can no longer be submitted. The questions below were collected during the session.</p>
          </div>
        ) : (
        <section
          aria-label="Ask a doubt"
          className="rounded-2xl border border-border bg-paper p-5 sm:p-6 shadow-xs mb-8"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-teal" />
              Ask an Anonymous Question
            </h2>
            <span className="text-[11px] font-mono text-ink-faint">
              No names attached
            </span>
          </div>

          {submissionFeedback && (
            <div className="mb-4">
              <Alert type={submissionFeedback.type === "pending" ? "info" : submissionFeedback.type === "error" ? "error" : "success"}>
                {submissionFeedback.message}
              </Alert>
            </div>
          )}

          <form onSubmit={handleSubmitDoubt} noValidate>
            <Textarea
              label="Your Academic Doubt"
              placeholder="e.g. Why do we divide by n-1 instead of n in sample standard deviation?"
              value={newDoubtText}
              onChange={(e) => setNewDoubtText(e.target.value)}
              error={composerError ?? undefined}
              charLimit={MAX_DOUBT_LENGTH}
              currentLength={newDoubtText.length}
              rows={3}
              className="text-base sm:text-sm"
              hint="Be specific. Related questions are grouped together so your teacher can explain them."
            />

            <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-[11px] text-ink-faint">
                Min {MIN_DOUBT_LENGTH} characters. Safe typos are automatically corrected.
              </p>

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
        )} {/* end lectureInfo.status !== "ended" */}

        {/* ── Feed Section ────────────────────────────────────────────────── */}
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
              {questions.map((q) => (
                <article
                  key={q.id}
                  className={`p-4 sm:p-5 rounded-xl border transition-all ${
                    q.isMySubmission
                      ? "border-teal/30 bg-teal-light/20"
                      : "border-border bg-paper hover:border-border-strong"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        {q.isMySubmission && (
                          <span className="text-[10px] font-mono uppercase bg-teal text-white px-2 py-0.5 rounded-full font-medium">
                            Your Submission
                          </span>
                        )}
                        <span className="text-xs text-ink-faint font-mono">
                          {q.timeAgo}
                        </span>
                      </div>

                      <p className="text-sm sm:text-base text-ink font-normal leading-relaxed">
                        {q.text}
                      </p>
                    </div>

                    {/* Me Too Button — Minimum 44px touch target */}
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
              ))}
            </div>
          )}
        </section>

        {/* ── Privacy Reminder ────────────────────────────────────────────── */}
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
