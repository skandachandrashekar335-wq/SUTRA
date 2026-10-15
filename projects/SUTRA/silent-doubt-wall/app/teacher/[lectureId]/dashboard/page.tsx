"use client";

import { useState, useEffect, use, Suspense } from "react";
import Link from "next/link";
import { SiteNav, StatusBadge, Button, EmptyState } from "@/components/ui";
import { QRCodeDisplay } from "@/components/QRCode";
import { buildJoinUrl } from "@/lib/utils";
import type { Lecture, RankedGroup } from "@/lib/types";

// ─── Realistic Demo Data for Phase 1 Preview ──────────────────────────────────
// Conforms strictly to the domain rules:
// - "mean" and "average" grouped
// - "mode" distinct
// - "mode in grouped data" distinct from generic mode
// - Explanation suggestions clearly identified as preview artifacts

const SAMPLE_GROUPS: (RankedGroup & {
  sampleDoubts: Array<{ original: string; cleaned: string; time: string }>;
})[] = [
  {
    id: "grp-1",
    lecture_id: "preview-stat101",
    canonical_question: "What is the mathematical difference between mean and average?",
    subject_tag: "Foundations",
    status: "active",
    total_submissions: 6,
    vote_count: 14,
    rank: 1,
    is_top3: true,
    created_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    explanation_suggestion:
      "Clarify that 'average' colloquially refers to the arithmetic mean, but statistically includes median and mode. Give a 30-second concrete illustration with 5 sample quiz scores.",
    doubts: [],
    sampleDoubts: [
      { original: "What is the formula for mean?", cleaned: "What is the formula for mean?", time: "22m ago" },
      { original: "How do we calculate average?", cleaned: "How do we calculate average?", time: "18m ago" },
      { original: "is arithmetic mean the same as general average??", cleaned: "Is arithmetic mean the same as general average?", time: "15m ago" },
      { original: "formula for avg pls", cleaned: "Formula for average please", time: "9m ago" },
    ],
  },
  {
    id: "grp-2",
    lecture_id: "preview-stat101",
    canonical_question: "How do we identify the modal class in grouped frequency distribution?",
    subject_tag: "Grouped Data",
    status: "active",
    total_submissions: 4,
    vote_count: 9,
    rank: 2,
    is_top3: true,
    created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    explanation_suggestion:
      "Review the formula Mode = L + [(f1 - f0) / (2f1 - f0 - f2)] * h step-by-step. Students are confused between f0 (preceding) and f1 (modal).",
    doubts: [],
    sampleDoubts: [
      { original: "How do we calculate mode in grouped data?", cleaned: "How do we calculate mode in grouped data?", time: "19m ago" },
      { original: "what is f1 and f0 in mode formula", cleaned: "What is f1 and f0 in the mode formula?", time: "12m ago" },
      { original: "modal class identification confusion", cleaned: "Confusion regarding modal class identification", time: "6m ago" },
    ],
  },
  {
    id: "grp-3",
    lecture_id: "preview-stat101",
    canonical_question: "Why is the median preferred over mean when data has extreme outliers?",
    subject_tag: "Outliers",
    status: "active",
    total_submissions: 3,
    vote_count: 7,
    rank: 3,
    is_top3: true,
    created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    explanation_suggestion:
      "Show salary distribution example: 9 people earning 30k and 1 CEO earning 1M. The mean misleads, median represents typical worker.",
    doubts: [],
    sampleDoubts: [
      { original: "Why median not affected by outliers?", cleaned: "Why is median unaffected by outliers?", time: "14m ago" },
      { original: "when to use median instead of mean in real exams", cleaned: "When to use median instead of mean in exams?", time: "8m ago" },
    ],
  },
  {
    id: "grp-4",
    lecture_id: "preview-stat101",
    canonical_question: "What is the basic formula for mode in simple ungrouped series?",
    subject_tag: "Ungrouped",
    status: "active",
    total_submissions: 2,
    vote_count: 3,
    rank: null,
    is_top3: false,
    created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    explanation_suggestion: null,
    doubts: [],
    sampleDoubts: [
      { original: "What is the formula for mode?", cleaned: "What is the formula for mode?", time: "10m ago" },
    ],
  },
];

type DashboardGroup = RankedGroup & {
  sampleDoubts?: Array<{ original: string; cleaned: string; time: string }>;
};

function TeacherDashboardContent({
  params,
}: {
  params: Promise<{ lectureId: string }>;
}) {
  const resolvedParams = use(params);
  const lectureId = resolvedParams.lectureId;

  const [liveLecture, setLiveLecture] = useState<Lecture>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem("sdw_lecture");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.id === lectureId) return parsed;
        }
      } catch {
        // ignore
      }
    }
    // No session storage — return a minimal placeholder; the API poll will fill in real data
    return {
      id: lectureId,
      title: "",
      subject: "",
      section: "",
      join_code: "",
      status: "live" as const,
      teacher_id: "",
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
    };
  });

  const [liveGroups, setLiveGroups] = useState<DashboardGroup[]>([]);
  // Use demo data only for preview routes; otherwise wait for live API response
  const [useDemoData, setUseDemoData] = useState(() => lectureId.startsWith("preview-"));
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [projectorMode, setProjectorMode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [resolvedGroups, setResolvedGroups] = useState<Set<string>>(new Set());
  const [isEnding, setIsEnding] = useState(false);

  // Poll live lecture and groups from API
  useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      try {
        const res = await fetch(`/api/lectures/${lectureId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.ok && !cancelled) {
          setLiveLecture(json.data.lecture);
          if (json.data.groups && json.data.groups.length > 0) {
            setLiveGroups(json.data.groups);
          }
        }
      } catch {
        // network error / offline
      }
    }

    fetchDashboard();
    const interval = setInterval(fetchDashboard, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [lectureId]);

  const lecture = liveLecture;
  const joinCode = lecture?.join_code ?? "STAT3X";
  const joinUrl = buildJoinUrl(joinCode);

  async function handleEndLecture() {
    if (!confirm("Are you sure you want to end this lecture? Students will no longer be able to submit new doubts.")) {
      return;
    }
    setIsEnding(true);
    try {
      const res = await fetch(`/api/lectures/${lectureId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      });
      const json = await res.json();
      if (json.ok) {
        setLiveLecture((prev) => ({ ...prev, status: "ended" }));
      } else {
        alert(json.error || "Failed to end lecture");
      }
    } catch {
      alert("Network error ending lecture");
    } finally {
      setIsEnding(false);
    }
  }

  function handleCopy(text: string, type: "code" | "link") {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      if (type === "code") {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    }
  }

  function toggleResolve(id: string) {
    setResolvedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const effectiveGroups = useDemoData ? SAMPLE_GROUPS : liveGroups;
  const activeGroups = effectiveGroups.filter((g) => !resolvedGroups.has(g.id));
  const top3 = activeGroups.filter((g) => g.is_top3 || (g.rank && g.rank <= 3)).slice(0, 3);
  const otherGroups = activeGroups.filter((g) => !top3.some((t) => t.id === g.id));

  // ── Projector Mode View ───────────────────────────────────────────────────
  if (projectorMode) {
    return (
      <div className="min-h-screen bg-ink text-paper flex flex-col justify-between p-8 sm:p-14">
        <header className="flex items-center justify-between border-b border-paper/15 pb-6">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-amber live-dot" />
            <span className="text-sm font-mono tracking-widest uppercase text-amber-light font-semibold">
              LIVE CLASSROOM DOUBT WALL
            </span>
          </div>
          <button
            onClick={() => setProjectorMode(false)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-paper/10 hover:bg-paper/20 text-paper transition-colors"
          >
            Exit Projector Mode (Esc)
          </button>
        </header>

        <main className="grid md:grid-cols-2 gap-12 items-center my-auto max-w-6xl mx-auto w-full">
          <div>
            <p className="text-teal-light text-base sm:text-lg mb-2 font-medium">
              {lecture?.subject} • {lecture?.section || "Class Session"}
            </p>
            <h1 className="font-display text-4xl sm:text-6xl text-paper leading-tight mb-8">
              {lecture?.title}
            </h1>

            <div className="bg-paper/5 border border-paper/15 rounded-2xl p-6 sm:p-8 backdrop-blur-sm">
              <p className="text-xs uppercase tracking-widest text-paper/60 mb-2 font-mono">
                Step 1: On phone, open browser or scan code
              </p>
              <p className="text-xl sm:text-2xl font-mono text-teal-light mb-4 font-semibold">
                {joinUrl ?? "sutra.app/join"}
              </p>

              <p className="text-xs uppercase tracking-widest text-paper/60 mb-2 font-mono">
                Step 2: Enter Room Code
              </p>
              <p className="text-4xl sm:text-6xl font-mono tracking-[0.25em] font-bold text-amber">
                {joinCode}
              </p>
              <p className="mt-4 text-sm text-paper/70">
                100% anonymous. No sign-up, email, or name requested.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center p-8 bg-paper rounded-3xl shadow-2xl">
            <QRCodeDisplay value={joinUrl || `https://sutra.app/join/${joinCode}`} size={280} />
            <p className="mt-4 text-xs font-mono text-ink-subtle uppercase tracking-wider text-center">
              Scan with phone camera to join
            </p>
          </div>
        </main>

        <footer className="border-t border-paper/15 pt-6 flex justify-between text-xs text-paper/50 font-mono">
          <span>SUTRA — Projection Display</span>
          <span>{activeGroups.length} Confusion Topics Tracked</span>
        </footer>
      </div>
    );
  }

  // ── Standard Teacher Dashboard ────────────────────────────────────────────
  return (
    <>
      <SiteNav />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">

        {/* ── Top Bar: Lecture Status & Actions ───────────────────────────── */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-border">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
              <StatusBadge status={lecture?.status ?? "live"} />
              <span className="text-xs font-medium text-teal px-2 py-0.5 rounded bg-teal-light">
                {lecture?.subject}
              </span>
              {lecture?.section && (
                <span className="text-xs text-ink-faint">
                  {lecture.section}
                </span>
              )}
              {useDemoData && (
                <span className="text-xs bg-amber-light text-amber-dark px-2 py-0.5 rounded border border-amber/30 font-medium">
                  Preview Demo Data
                </span>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl text-ink">
              {lecture?.title}
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setProjectorMode(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg bg-ink text-paper hover:bg-ink-subtle transition-colors focus-visible:rounded-lg"
              title="Open full-screen QR & join code for classroom projector"
            >
              <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" />
                <path d="M7 17h6v2H7v-2z" />
              </svg>
              Projector Mode
            </button>

            <Link
              href={`/lecture/${lectureId}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border bg-paper text-ink hover:bg-surface transition-colors"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4 text-teal" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M6 3h7v7M13 3L3 13" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Student View
            </Link>

            <button
              onClick={handleEndLecture}
              disabled={isEnding || lecture?.status === "ended"}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-rose/30 text-rose hover:bg-rose/10 transition-colors disabled:opacity-50"
              title="End lecture session"
            >
              {isEnding ? "Ending…" : lecture?.status === "ended" ? "Ended" : "End Lecture"}
            </button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setUseDemoData(!useDemoData)}
            >
              {useDemoData ? "Show Live Stream" : "Load Preview Data"}
            </Button>
          </div>
        </div>

        {/* ── Main Layout: Left Analytics (8 cols) + Right Join Box (4 cols) ─ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8">

          {/* Left Column: Confusion Groups & Top 3 ─────────────────────────── */}
          <section className="lg:col-span-8 space-y-8" aria-label="Student doubts stream">

            {/* Top 3 Section */}
            <div>
              <div className="flex items-baseline justify-between mb-4">
                <div>
                  <h2 className="text-xs font-mono font-semibold tracking-wider text-amber-dark uppercase flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber" />
                    Top 3 Classroom Confusion Points
                  </h2>
                  <p className="text-sm text-ink-subtle mt-0.5">
                    Highest consensus questions automatically ranked for immediate re-explanation
                  </p>
                </div>
                <span className="text-xs text-ink-faint font-mono">
                  {useDemoData ? "4 questions grouped" : `${activeGroups.length} active`}
                </span>
              </div>

              {!useDemoData && activeGroups.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-surface/50 p-8">
                  <EmptyState
                    title="No student doubts yet"
                    description="When students submit doubts from their phones, they will be processed, clustered, and ranked here live."
                    action={
                      <div className="mt-4 flex gap-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setUseDemoData(true)}
                        >
                          Show preview demo
                        </Button>
                        <Link
                          href={`/lecture/${lectureId}`}
                          className="text-sm font-medium text-teal hover:underline flex items-center gap-1"
                        >
                          Submit a doubt as student &rarr;
                        </Link>
                      </div>
                    }
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {top3.map((group) => {
                    const isExpanded = expandedGroup === group.id;
                    const isResolved = resolvedGroups.has(group.id);

                    return (
                      <article
                        key={group.id}
                        className={`rounded-xl border transition-all ${
                          group.rank === 1
                            ? "border-amber/40 bg-amber-light/20 shadow-xs"
                            : "border-border bg-paper"
                        }`}
                      >
                        <div className="p-4 sm:p-5">
                          <div className="flex items-start gap-3.5">
                            {/* Rank badge */}
                            <span
                              className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-base ${
                                group.rank === 1
                                  ? "bg-amber text-paper"
                                  : group.rank === 2
                                  ? "bg-teal text-white"
                                  : "bg-surface-2 text-ink-subtle"
                              }`}
                            >
                              #{group.rank}
                            </span>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                {group.subject_tag && (
                                  <span className="text-[11px] font-mono uppercase tracking-wider text-ink-faint bg-surface-2 px-1.5 py-0.5 rounded">
                                    {group.subject_tag}
                                  </span>
                                )}
                                <span className="text-xs font-semibold text-teal">
                                  {group.vote_count} students agree
                                </span>
                                <span className="text-xs text-ink-faint">
                                  • {group.total_submissions} raw doubts grouped
                                </span>
                              </div>

                              <h3 className="text-base sm:text-lg font-medium text-ink leading-snug">
                                {group.canonical_question}
                              </h3>

                              {/* AI Explanation Suggestion Box */}
                              {group.explanation_suggestion && (
                                <div className="mt-3.5 rounded-lg border border-teal/20 bg-teal-light/40 p-3 sm:p-3.5">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-[11px] font-mono uppercase tracking-wider font-semibold text-teal-dark flex items-center gap-1.5">
                                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 text-teal" fill="currentColor">
                                        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a.75.75 0 01.75.75v4a.75.75 0 01-1.5 0v-4A.75.75 0 018 4zm0 8a1 1 0 110-2 1 1 0 010 2z" />
                                      </svg>
                                      Suggested Re-explanation
                                    </span>
                                    <span className="text-[10px] text-ink-faint font-mono">
                                      Phase 2 Preview
                                    </span>
                                  </div>
                                  <p className="text-xs sm:text-sm text-ink-subtle leading-relaxed">
                                    {group.explanation_suggestion}
                                  </p>
                                </div>
                              )}

                              {/* Footer Actions */}
                              <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between gap-3 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                                  className="text-xs font-medium text-teal hover:text-teal-dark flex items-center gap-1"
                                >
                                  {isExpanded ? "Hide original submissions" : `View ${group.sampleDoubts?.length ?? 0} original submissions`}
                                  <svg
                                    viewBox="0 0 16 16"
                                    className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                  >
                                    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => toggleResolve(group.id)}
                                  className="text-xs px-2.5 py-1 rounded-md border border-border bg-paper hover:bg-surface text-ink-subtle hover:text-ink transition-colors"
                                >
                                  {isResolved ? "Mark Unresolved" : "✓ Mark Addressed"}
                                </button>
                              </div>

                              {/* Expanded raw student questions list */}
                              {isExpanded && group.sampleDoubts && (
                                <div className="mt-3 pt-3 border-t border-border/80 space-y-2">
                                  <p className="text-[11px] font-mono uppercase tracking-wider text-ink-faint">
                                    Raw student inputs (anonymised):
                                  </p>
                                  {group.sampleDoubts.map((d, idx) => (
                                    <div key={idx} className="flex items-baseline justify-between text-xs bg-surface p-2 rounded">
                                      <span className="text-ink font-mono text-[11px]">{d.original}</span>
                                      <span className="text-ink-faint shrink-0 ml-2">{d.time}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Other Confusion Topics */}
            {useDemoData && otherGroups.length > 0 && (
              <div>
                <h3 className="text-xs font-mono font-semibold tracking-wider text-ink-subtle uppercase mb-3">
                  Other Active Questions
                </h3>
                <div className="rounded-xl border border-border bg-paper divide-y divide-border">
                  {otherGroups.map((g) => (
                    <div key={g.id} className="p-4 flex items-center justify-between gap-4">
                      <div>
                        <span className="text-xs text-ink-faint font-mono mr-2">#{g.subject_tag}</span>
                        <span className="text-sm text-ink">{g.canonical_question}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-teal font-medium">{g.vote_count} votes</span>
                        <button
                          onClick={() => toggleResolve(g.id)}
                          className="text-xs text-ink-faint hover:text-ink"
                        >
                          Mark resolved
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Right Column: Classroom Join Box & QR Code ───────────────────── */}
          <aside className="lg:col-span-4 space-y-6" aria-label="Classroom connection info">

            <div className="rounded-2xl border border-border bg-paper p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-mono uppercase tracking-wider font-semibold text-ink-subtle">
                  Classroom Access
                </h2>
                <span className="text-[10px] font-mono bg-emerald-light text-emerald px-2 py-0.5 rounded-full font-medium">
                  READY
                </span>
              </div>

              {/* QR Code Presentation Box */}
              <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-surface border border-border">
                <QRCodeDisplay
                  value={joinUrl || `https://sutra.app/join/${joinCode}`}
                  size={190}
                />
                <p className="mt-3 text-xs text-ink-subtle text-center">
                  Students scan to join instantly without logging in.
                </p>
              </div>

              {/* Join Code Display */}
              <div className="mt-5 space-y-3">
                <div>
                  <label className="text-xs text-ink-faint font-medium">Classroom Code</label>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg font-mono text-xl tracking-[0.2em] font-bold text-center text-ink">
                      {joinCode}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(joinCode, "code")}
                      className="px-3 py-2 text-xs font-medium rounded-lg border border-border bg-paper hover:bg-surface text-ink transition-colors"
                      title="Copy join code"
                    >
                      {copiedCode ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-ink-faint font-medium">Direct Join Link</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      readOnly
                      value={joinUrl || `http://localhost:3000/join/${joinCode}`}
                      className="flex-1 px-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-ink-subtle truncate font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(joinUrl || `http://localhost:3000/join/${joinCode}`, "link")}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-paper hover:bg-surface text-ink transition-colors shrink-0"
                    >
                      {copiedLink ? "Copied!" : "Copy Link"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Projector Trigger */}
              <button
                type="button"
                onClick={() => setProjectorMode(true)}
                className="w-full mt-5 py-2.5 px-4 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-dark transition-colors flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" />
                </svg>
                Present on Projector
              </button>
            </div>

            {/* Pipeline Architecture Status Card */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-ink-subtle mb-3">
                Pipeline Architecture Status
              </h3>
              <ul className="space-y-2 text-xs text-ink-subtle">
                <li className="flex items-center justify-between">
                  <span>Anonymous Ingestion</span>
                  <span className="font-mono text-emerald font-semibold">Active</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Typo Normalisation</span>
                  <span className="font-mono text-ink-faint">Local Rule Set</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Semantic Grouping</span>
                  <span className="font-mono text-amber-dark">Phase 2 Local NLP</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Abuse Auto-Moderation</span>
                  <span className="font-mono text-ink-faint">Phase 2 Rule Engine</span>
                </li>
              </ul>
              <div className="mt-4 pt-3 border-t border-border/80 text-[11px] text-ink-faint leading-normal">
                Phase 1 data is managed in browser session memory. Supabase PostgreSQL with RLS and realtime websockets will be wired in Phase 2.
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

export default function TeacherDashboardPage(props: {
  params: Promise<{ lectureId: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <TeacherDashboardContent params={props.params} />
    </Suspense>
  );
}
