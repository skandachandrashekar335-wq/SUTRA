import Link from "next/link";
import { SiteNav } from "@/components/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SUTRA — Anonymous classroom intelligence",
  description:
    "SUTRA helps teachers discover what students don't understand — without asking anyone to speak up.",
};

// ─── SVG: Classroom workflow illustration ─────────────────────────────────────

function ClassroomFlowIllustration() {
  return (
    <svg
      viewBox="0 0 560 240"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full max-w-[560px]"
      aria-label="Diagram: students submit anonymous doubts; SUTRA groups them; teacher sees top three confusion points"
      role="img"
    >
      {/* ── Students (left) ── */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${10 + i * 58}, ${26 + (i % 2) * 28})`}>
          <circle cx="22" cy="22" r="20" fill="#E8F4F4" stroke="#1D6A6A" strokeWidth="1.5" />
          <circle cx="22" cy="17" r="6.5" fill="#1D6A6A" />
          <path d="M9 38c0-7.2 5.8-13 13-13s13 5.8 13 13" fill="#1D6A6A" />
        </g>
      ))}

      {/* ── Doubt bubbles (centre-left) ── */}
      {[
        { y: 28,  text: "formula for mean?",        w: 130 },
        { y: 74,  text: "how is avg calculated?",    w: 144 },
        { y: 120, text: "what is mode formula?",     w: 138 },
        { y: 166, text: "median vs mean — outliers?", w: 162 },
      ].map(({ y, text, w }, i) => (
        <g key={i}>
          <rect x="210" y={y} width={w} height="30" rx="15" fill="#E8F4F4" stroke="#1D6A6A" strokeOpacity="0.3" strokeWidth="1" />
          <text x={210 + w / 2} y={y + 19.5} textAnchor="middle" fontSize="10" fill="#1D6A6A" fontFamily="Inter, sans-serif">{text}</text>
        </g>
      ))}

      {/* ── SUTRA processing node ── */}
      <g transform="translate(374, 84)">
        <rect width="56" height="72" rx="10" fill="#FEF3C7" stroke="#D97706" strokeOpacity="0.5" strokeWidth="1.5" />
        <text x="28" y="20" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#B45309" fontFamily="Inter, sans-serif">SUTRA</text>
        {/* Shield icon */}
        <path d="M28 28l9 5v11c0 6-4.5 11.5-9 13-4.5-1.5-9-7-9-13V33l9-5z" fill="#D97706" fillOpacity="0.2" stroke="#D97706" strokeWidth="1.2"/>
        <path d="M24 42l3 3 6-6" stroke="#D97706" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </g>

      {/* ── Teacher ranked view (right) ── */}
      <g transform="translate(450, 12)">
        <rect width="100" height="214" rx="10" fill="#FAFAF8" stroke="#D8D8D4" strokeWidth="1.5" />
        <text x="50" y="24" textAnchor="middle" fontSize="8" fontWeight="700" fill="#4A4A50" fontFamily="Inter, sans-serif" letterSpacing="0.5">TOP CONFUSION</text>
        {[
          { rank: "1", q: "mean vs. average?",        votes: 14, color: "#D97706", bg: "#FEF3C7" },
          { rank: "2", q: "mode in grouped data?",    votes: 9,  color: "#1D6A6A", bg: "#E8F4F4" },
          { rank: "3", q: "median & outliers?",        votes: 6,  color: "#4A9090", bg: "#E8F4F4" },
        ].map(({ rank, q, votes, color, bg }, i) => (
          <g key={i} transform={`translate(8, ${34 + i * 58})`}>
            <rect width="84" height="50" rx="6" fill={bg} stroke={color} strokeOpacity="0.25" strokeWidth="1" />
            <text x="10" y="18" fontSize="13" fontWeight="700" fill={color} fontFamily="Inter, sans-serif">{rank}</text>
            <text x="10" y="32" fontSize="8.5" fill="#18181A" fontFamily="Inter, sans-serif">{q}</text>
            <text x="10" y="44" fontSize="8" fill="#8A8A92" fontFamily="Inter, sans-serif">{votes} students</text>
          </g>
        ))}
      </g>

      {/* ── Arrow: doubts → SUTRA ── */}
      <line x1="358" y1="120" x2="373" y2="120" stroke="#BCBCB6" strokeWidth="1.5" />
      <polygon points="373,116 380,120 373,124" fill="#BCBCB6" />

      {/* ── Arrow: SUTRA → teacher view ── */}
      <line x1="430" y1="120" x2="448" y2="120" stroke="#BCBCB6" strokeWidth="1.5" />
      <polygon points="448,116 455,120 448,124" fill="#BCBCB6" />
    </svg>
  );
}

// ─── How it works steps ───────────────────────────────────────────────────────

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Teacher starts a lecture",
    body: "Enter a title and subject. SUTRA generates a unique classroom code and QR instantly.",
  },
  {
    step: "02",
    title: "Students join anonymously",
    body: "No account, no name. Students scan the QR code or type the code — they're in.",
  },
  {
    step: "03",
    title: "Doubts flow in freely",
    body: "Students type questions in their own words, or tap 'Me too' on a question already there.",
  },
  {
    step: "04",
    title: "SUTRA groups and ranks",
    body: "Related doubts are merged automatically. Distinct concepts stay separate. Abuse is filtered before it reaches the feed.",
  },
  {
    step: "05",
    title: "Teacher sees what matters",
    body: "A live top-3 confusion list surfaces the biggest misunderstandings — not a raw dump of every message.",
  },
  {
    step: "06",
    title: "Smarter re-explanation",
    body: "Each top confusion point comes with a brief, teacher-facing suggestion for how to address it concisely.",
  },
];

// ─── Product features ─────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "No accounts needed",
    body: "Students join by scanning a QR code. No name, no email, no login. Each session uses an ephemeral token that cannot be traced back to anyone.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07M8.46 8.46a5 5 0 0 0 0 7.07" />
      </svg>
    ),
    title: "Intelligent grouping",
    body: "\"What is the formula for mean?\" and \"How do I calculate average?\" are grouped together. \"What is the formula for mode?\" remains separate — as it should.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    title: "Live top-3 signals",
    body: "The teacher's dashboard shows three ranked confusion points — not a raw stream. Repetition amplifies signal, not noise.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    title: "Moderation before it reaches the feed",
    body: "Clear abuse is filtered automatically. Ambiguous submissions are held for teacher review, not auto-blocked.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: "\"Me too\" voting",
    body: "Students don't need to re-type the same question. One tap on an existing doubt signals agreement — quietly.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    title: "Re-explanation suggestions",
    body: "Each top confusion group surfaces a concise suggestion for how to revisit the concept — so you can address it in 30 seconds, not five minutes.",
  },
];

// ─── Demo preview ─────────────────────────────────────────────────────────────

function TeacherDashboardPreview() {
  return (
    <div className="relative" aria-label="Example teacher dashboard — preview only">
      {/* DEMO badge */}
      <div
        aria-hidden="true"
        className="absolute -top-2.5 right-3 z-10 px-2.5 py-1 rounded-full bg-ink text-paper text-[10px] font-semibold tracking-widest uppercase"
      >
        Preview
      </div>

      <div className="rounded-2xl border border-border bg-paper shadow-lg overflow-hidden max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-xs text-ink-faint uppercase tracking-wide mb-0.5">Introduction to Statistics</p>
            <p className="font-medium text-ink text-sm">Week 4 — Measures of Central Tendency</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-light text-amber-dark text-xs font-medium">
            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-amber live-dot" />
            Live · 28 students
          </span>
        </div>

        {/* Top confusion */}
        <div className="p-5">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-widest mb-3">Top confusion · 3 of 12 groups</p>
          <div className="space-y-3">
            {[
              {
                rank: 1,
                q: "What is the difference between mean and average?",
                count: 14,
                tag: "Foundations",
                suggestion: "Clarify that 'average' colloquially means arithmetic mean, but statistically it includes median and mode.",
              },
              {
                rank: 2,
                q: "How do we identify the modal class in grouped data?",
                count: 9,
                tag: "Grouped Data",
                suggestion: null,
              },
              {
                rank: 3,
                q: "Why is the median preferred when there are outliers?",
                count: 6,
                tag: "Outliers",
                suggestion: null,
              },
            ].map(({ rank, q, count, tag, suggestion }) => (
              <div
                key={rank}
                className={`flex items-start gap-3 p-3.5 rounded-xl border ${
                  rank === 1 ? "border-amber/30 bg-amber-light/30" : "border-border bg-surface"
                }`}
              >
                <span
                  className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold ${
                    rank === 1 ? "bg-amber text-white" : "bg-surface-2 text-ink-subtle"
                  }`}
                >
                  {rank}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink leading-snug mb-1">{q}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-ink-faint">{count} students confused</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-teal-light text-teal">{tag}</span>
                  </div>
                  {suggestion && (
                    <p className="mt-2 text-xs text-ink-subtle leading-relaxed border-l-2 border-amber/50 pl-2.5 italic">
                      {suggestion}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── The classroom problem section ────────────────────────────────────────────

function ClassroomProblem() {
  const problems = [
    {
      icon: "💬",
      heading: "Most students don't raise their hand",
      detail:
        "Public embarrassment is a real barrier. A student who doesn't understand something often stays silent rather than risk looking confused in front of peers.",
    },
    {
      icon: "🔄",
      heading: "The same doubt appears in different words",
      detail:
        "One student asks \"what is the formula for mean?\", another asks \"how do I calculate average?\". A teacher fielding questions live has no way to know these are the same confusion.",
    },
    {
      icon: "🌊",
      heading: "Repetitive questions hide the real blockers",
      detail:
        "When teachers take unfiltered questions, the most frequently asked questions dominate — even if they represent a smaller block than the one question nobody typed twice.",
    },
    {
      icon: "⏱",
      heading: "There is no time to re-teach everything",
      detail:
        "Teachers need to know the single most important thing to address before the lecture ends — not a list of 30 questions with no ranking.",
    },
  ];

  return (
    <div className="grid sm:grid-cols-2 gap-6">
      {problems.map(({ icon, heading, detail }) => (
        <div key={heading} className="p-5 rounded-xl border border-border bg-paper">
          <div className="text-2xl mb-3" aria-hidden="true">{icon}</div>
          <h3 className="font-medium text-ink mb-2 text-sm">{heading}</h3>
          <p className="text-sm text-ink-subtle leading-relaxed">{detail}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Landing page ─────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      <SiteNav />
      <main className="flex-1">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative border-b border-border overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[image:linear-gradient(to_right,#D8D8D4_1px,transparent_1px),linear-gradient(to_bottom,#D8D8D4_1px,transparent_1px)] bg-[size:32px_32px] opacity-35"
          />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-32">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              {/* Copy */}
              <div>
                <p className="text-sm font-semibold text-teal mb-4 tracking-widest uppercase">
                  Anonymous classroom intelligence
                </p>
                <h1 className="font-display text-4xl sm:text-5xl md:text-6xl text-ink leading-[1.05] tracking-tight mb-6">
                  Every silent doubt deserves to be&nbsp;heard.
                </h1>
                <p className="text-lg text-ink-subtle leading-relaxed mb-3 max-w-xl">
                  SUTRA helps teachers discover what students don&apos;t understand — without asking anyone to speak up.
                </p>
                <p className="text-sm text-ink-faint leading-relaxed mb-10 max-w-xl">
                  Students submit doubts anonymously. SUTRA groups them intelligently and surfaces the three biggest confusion points — live, ranked, ready to address.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/teacher/new"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-dark transition-colors focus-visible:rounded-lg"
                  >
                    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
                    </svg>
                    Start a lecture — for free
                  </Link>
                  <Link
                    href="/join"
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg border border-border bg-paper text-ink text-sm font-medium hover:bg-surface transition-colors focus-visible:rounded-lg"
                  >
                    I have a classroom code
                  </Link>
                </div>
              </div>

              {/* Illustration */}
              <div className="flex justify-center md:justify-end">
                <ClassroomFlowIllustration />
              </div>
            </div>
          </div>
        </section>

        {/* ── The problem ──────────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-semibold text-teal-mid uppercase tracking-widest mb-2">The problem</p>
            <h2 className="font-display text-3xl md:text-4xl text-ink leading-tight mb-4">
              The classroom has a listening problem.
            </h2>
            <p className="text-ink-subtle leading-relaxed">
              Most students leave lectures with unanswered questions. Most teachers leave without knowing which concept cost the room 20 minutes of confusion. This gap is preventable.
            </p>
          </div>
          <ClassroomProblem />
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section className="border-t border-b border-border bg-surface">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
            <div className="max-w-xl mb-12">
              <p className="text-xs font-semibold text-teal-mid uppercase tracking-widest mb-2">How it works</p>
              <h2 className="font-display text-3xl md:text-4xl text-ink leading-tight">
                Six steps from silence to signal.
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {HOW_IT_WORKS.map(({ step, title, body }) => (
                <div key={step} className="relative p-5 rounded-xl border border-border bg-paper group hover:border-teal/40 transition-colors">
                  <span className="block font-display text-4xl text-ink-faint/30 leading-none mb-3 select-none" aria-hidden="true">
                    {step}
                  </span>
                  <h3 className="font-semibold text-ink text-sm mb-2">{title}</h3>
                  <p className="text-sm text-ink-subtle leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Teacher dashboard demo ────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <p className="text-xs font-semibold text-teal-mid uppercase tracking-widest mb-2">Teacher experience</p>
              <h2 className="font-display text-3xl md:text-4xl text-ink leading-tight mb-4">
                Three signals, clearly ranked.
              </h2>
              <p className="text-ink-subtle leading-relaxed mb-6">
                The teacher&apos;s dashboard does not show every question. It shows the three biggest confusion clusters — with a vote count and a concise re-explanation suggestion for the top one.
              </p>
              <ul className="space-y-3 text-sm text-ink-subtle">
                {[
                  "Related doubts are grouped — similar questions count together",
                  "Distinct concepts stay separate — mode and mean are never merged",
                  "Each group shows how many students are confused, not just who asked first",
                  "Re-explanation suggestions are kept short — one sentence you can say out loud",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span aria-hidden="true" className="mt-0.5 w-4 h-4 rounded-full bg-emerald-light text-emerald flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Link
                  href="/teacher/new"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-dark transition-colors"
                >
                  Start your first lecture
                </Link>
              </div>
            </div>
            <div className="md:pt-6">
              <TeacherDashboardPreview />
            </div>
          </div>
        </section>

        {/* ── Intelligent processing ────────────────────────────────────────── */}
        <section className="border-t border-b border-border bg-surface">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-xs font-semibold text-teal-mid uppercase tracking-widest mb-2">Intelligent processing</p>
                <h2 className="font-display text-3xl md:text-4xl text-ink leading-tight mb-4">
                  Not every question is a different question.
                </h2>
                <p className="text-ink-subtle leading-relaxed mb-6">
                  SUTRA is designed to recognise when different phrasings express the same underlying confusion — and when they don&apos;t.
                </p>

                {/* Grouping example */}
                <div className="rounded-xl border border-border bg-paper p-5 space-y-4">
                  <div>
                    <p className="text-xs font-semibold text-teal uppercase tracking-wide mb-2">Grouped → same confusion</p>
                    <div className="space-y-1.5">
                      {["What is the formula for mean?", "How do I calculate average?", "Is arithmetic mean the same as average?"].map(q => (
                        <div key={q} className="flex items-center gap-2 text-xs text-ink-subtle">
                          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-teal shrink-0" />
                          {q}
                        </div>
                      ))}
                    </div>
                  </div>
                  <hr className="border-border" />
                  <div>
                    <p className="text-xs font-semibold text-amber-dark uppercase tracking-wide mb-2">Kept separate → different concepts</p>
                    <div className="space-y-1.5">
                      {["What is the formula for mean?", "What is the formula for mode?"].map(q => (
                        <div key={q} className="flex items-center gap-2 text-xs text-ink-subtle">
                          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" />
                          {q}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-teal-mid uppercase tracking-widest mb-2">Processing pipeline</p>
                <div className="space-y-3">
                  {[
                    { label: "Typo correction",       desc: "Minor spelling errors are cleaned without changing the question's meaning.", icon: "✏️" },
                    { label: "Duplicate detection",   desc: "Identical or near-identical questions are merged so they count together.",    icon: "⊕" },
                    { label: "Semantic grouping",     desc: "Related phrasings of the same concept are clustered under one canonical question.", icon: "◎" },
                    { label: "Abuse filtering",       desc: "Clearly inappropriate content is removed before reaching the classroom feed.",    icon: "🛡" },
                    { label: "Ambiguous review",      desc: "Edge cases are flagged for teacher review, not auto-blocked.", icon: "⚑" },
                    { label: "Ranking by impact",     desc: "Groups are ranked by total votes, not submission order.",      icon: "↑" },
                  ].map(({ label, desc, icon }) => (
                    <div key={label} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-paper">
                      <span className="text-base mt-0.5 shrink-0" aria-hidden="true">{icon}</span>
                      <div>
                        <p className="text-sm font-medium text-ink">{label}</p>
                        <p className="text-xs text-ink-subtle mt-0.5">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Anonymity ────────────────────────────────────────────────────── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <p className="text-xs font-semibold text-teal-mid uppercase tracking-widest mb-2">Anonymity and trust</p>
              <h2 className="font-display text-3xl md:text-4xl text-ink leading-tight mb-4">
                Ask the question you&apos;d never raise your hand for.
              </h2>
              <p className="text-ink-subtle leading-relaxed mb-6">
                SUTRA is designed to let students participate without fear — no login, no name, no record tied to them beyond their browser session.
              </p>
              <div className="space-y-4">
                {[
                  {
                    heading: "No student account",
                    detail: "Students join by scanning a QR code or entering a code. Nothing is collected.",
                  },
                  {
                    heading: "No name attached to a doubt",
                    detail: "Questions appear in the classroom feed without any identifying information.",
                  },
                  {
                    heading: "Moderation before the feed",
                    detail: "All submissions pass through a moderation step. Abuse does not reach other students.",
                  },
                  {
                    heading: "Reasonable, not absolute",
                    detail: "SUTRA does not claim perfect anonymity. Your IP is handled by your network and hosting provider normally. What SUTRA does: it does not store your name or link your questions to you.",
                  },
                ].map(({ heading, detail }) => (
                  <div key={heading} className="flex items-start gap-3">
                    <span aria-hidden="true" className="mt-1 w-5 h-5 rounded-full bg-teal-light text-teal flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    </span>
                    <div>
                      <p className="text-sm font-medium text-ink">{heading}</p>
                      <p className="text-xs text-ink-subtle mt-0.5 leading-relaxed">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-teal-mid uppercase tracking-widest mb-4">For students</p>
                <div className="space-y-3">
                  {[
                    "Ask questions without public embarrassment",
                    "Submit doubts in your own words — no formatting required",
                    "Support another student's question with one tap: 'Me too'",
                    "See questions organised and clearly grouped",
                  ].map(item => (
                    <div key={item} className="flex items-start gap-2.5 text-sm text-ink-subtle">
                      <span aria-hidden="true" className="mt-0.5 text-teal">→</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <hr className="border-border" />

              <div>
                <p className="text-xs font-semibold text-teal-mid uppercase tracking-widest mb-4">For teachers</p>
                <div className="space-y-3">
                  {[
                    "Identify the biggest misunderstandings before the lecture ends",
                    "Spend time re-teaching concepts that actually need attention",
                    "Avoid reading 30 repetitive questions one by one",
                    "Review per-session confusion trends as history becomes available",
                  ].map(item => (
                    <div key={item} className="flex items-start gap-2.5 text-sm text-ink-subtle">
                      <span aria-hidden="true" className="mt-0.5 text-teal">→</span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features grid ────────────────────────────────────────────────── */}
        <section className="border-t border-border bg-surface">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
            <h2 className="font-display text-3xl md:text-4xl text-ink text-center mb-3 leading-tight">
              Built for the real classroom.
            </h2>
            <p className="text-ink-subtle text-center mb-12 max-w-md mx-auto">
              Not a polling tool. Not a chat feed. A purpose-built confusion tracker.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map(({ icon, title, body }) => (
                <div key={title} className="p-6 rounded-xl border border-border bg-paper hover:border-teal/40 transition-colors group">
                  <div className="w-9 h-9 rounded-lg bg-teal-light text-teal flex items-center justify-center mb-4 group-hover:bg-teal group-hover:text-white transition-colors">
                    {icon}
                  </div>
                  <h3 className="font-medium text-ink mb-2 text-sm">{title}</h3>
                  <p className="text-sm text-ink-subtle leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────────────────── */}
        <section className="border-t border-border">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
            <div className="max-w-2xl mx-auto text-center">
              <h2 className="font-display text-3xl md:text-5xl text-ink mb-4 leading-tight">
                Ready for your next lecture?
              </h2>
              <p className="text-ink-subtle mb-10 text-lg max-w-md mx-auto leading-relaxed">
                Start a lecture in under a minute. Students join without downloading anything. No setup, no accounts.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/teacher/new"
                  className="inline-flex items-center justify-center px-8 py-3.5 rounded-lg bg-teal text-white text-sm font-medium hover:bg-teal-dark transition-colors focus-visible:rounded-lg"
                >
                  Start a lecture — I&apos;m a teacher
                </Link>
                <Link
                  href="/join"
                  className="inline-flex items-center justify-center px-8 py-3.5 rounded-lg border border-border text-ink text-sm font-medium hover:bg-surface transition-colors focus-visible:rounded-lg"
                >
                  Join with a code — I&apos;m a student
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <div className="grid sm:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/sutra-logo.png" alt="" aria-hidden="true" className="w-7 h-7 object-contain rounded-md" />
                <span className="font-display text-lg">SUTRA</span>
              </div>
              <p className="text-xs text-ink-faint leading-relaxed max-w-xs">
                Anonymous classroom intelligence. Students ask freely; teachers see what matters.
              </p>
              <p className="text-xs text-ink-faint mt-2">
                Participating students are not tracked or identified.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink uppercase tracking-widest mb-3">For teachers</p>
              <div className="space-y-2">
                <Link href="/teacher/new" className="block text-sm text-ink-subtle hover:text-ink transition-colors">Start a lecture</Link>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-ink uppercase tracking-widest mb-3">For students</p>
              <div className="space-y-2">
                <Link href="/join" className="block text-sm text-ink-subtle hover:text-ink transition-colors">Join a lecture</Link>
              </div>
            </div>
          </div>
          <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink-faint">
            <span>SUTRA — Anonymous classroom intelligence</span>
            <span>MVP · Supabase integration pending · No production data is collected at this stage.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
