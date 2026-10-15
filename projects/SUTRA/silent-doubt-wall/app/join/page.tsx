"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { SiteNav, Button } from "@/components/ui";
import { joinLectureSchema } from "@/lib/validation";
import { normalizeJoinCode } from "@/lib/utils";

// ─── Student join page ────────────────────────────────────────────────────────
// Route: /join  OR  /join/[CODE]  (optional pre-filled code from QR link)

function JoinContent() {
  const router = useRouter();
  const params = useParams();
  const prefilledCode = typeof params?.code === "string" ? params.code : "";

  const [code, setCode] = useState(prefilledCode.toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input on mount
  useEffect(() => {
    if (!prefilledCode) inputRef.current?.focus();
  }, [prefilledCode]);

  // If a code was pre-filled from QR scan, auto-submit
  useEffect(() => {
    if (prefilledCode.length === 6) {
      handleJoin(prefilledCode.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Code input handler ────────────────────────────────────────────────────

  function handleCodeChange(raw: string) {
    // Normalize and cap at 6 chars
    const normalized = normalizeJoinCode(raw).slice(0, 6);
    setCode(normalized);
    if (error) setError(null);
  }

  // ── Join ──────────────────────────────────────────────────────────────────

  async function handleJoin(submitCode?: string) {
    const joinCode = submitCode ?? code;
    const validation = joinLectureSchema.safeParse({ join_code: joinCode });

    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Invalid code");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/lectures/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ join_code: joinCode }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setError(json.error || "No active lecture found with that code. Ask your teacher to confirm the code.");
        return;
      }

      router.push(`/lecture/${json.data.id}`);
    } catch {
      setError("Network connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    handleJoin();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <SiteNav />

      <main className="flex-1 flex flex-col">

        {/* Mobile-first hero — welcoming, not administrative */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-16">
          <div className="w-full max-w-sm">

            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-teal-light flex items-center justify-center">
                <svg viewBox="0 0 32 32" className="w-8 h-8 text-teal" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M16 4C9.4 4 4 8.5 4 14c0 3 1.6 5.7 4 7.5V26l4.5-2.5c1.1.3 2.3.5 3.5.5 6.6 0 12-4.5 12-10S22.6 4 16 4z" />
                  <path d="M11 14h10M11 18h6" />
                </svg>
              </div>
            </div>

            {/* Heading */}
            <div className="text-center mb-8">
              <h1 className="font-display text-2xl sm:text-3xl text-ink mb-2">
                Join a lecture
              </h1>
              <p className="text-sm text-ink-subtle leading-relaxed">
                Enter the 6-character code your teacher displayed.
                No account or download needed.
              </p>
            </div>

            {/* Code entry form */}
            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-4">
                <label
                  htmlFor="join-code"
                  className="block text-sm font-medium text-ink mb-2"
                >
                  Lecture code
                </label>
                <input
                  ref={inputRef}
                  id="join-code"
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="A B C 1 2 3"
                  maxLength={6}
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  aria-describedby={error ? "code-error" : "code-hint"}
                  aria-invalid={!!error}
                  className={`w-full rounded-xl border px-4 py-4 text-center text-2xl font-mono tracking-[0.4em] font-bold bg-paper text-ink placeholder:text-ink-faint/40 placeholder:tracking-widest transition-colors
                    ${error
                      ? "border-rose focus:border-rose focus:ring-1 focus:ring-rose/40 focus:outline-none"
                      : "border-border focus:border-teal focus:ring-2 focus:ring-teal/20 focus:outline-none"
                    }`}
                />
                <p id="code-hint" className="sr-only">
                  Enter the 6-character alphanumeric code shown by your teacher.
                </p>
                {error && (
                  <p id="code-error" role="alert" className="mt-2 text-xs text-rose flex items-start gap-1.5">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="currentColor" aria-hidden="true">
                      <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a.75.75 0 01.75.75v4a.75.75 0 01-1.5 0v-4A.75.75 0 018 4zm0 8a1 1 0 110-2 1 1 0 010 2z" />
                    </svg>
                    {error}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isLoading}
                disabled={code.length !== 6}
                className="w-full"
              >
                {isLoading ? "Joining…" : "Join lecture"}
              </Button>
            </form>

            {/* Divider */}
            <div className="mt-8 pt-8 border-t border-border">

              {/* How anonymity works */}
              <div className="rounded-xl bg-surface border border-border p-4">
                <h2 className="text-xs font-semibold text-ink mb-3 uppercase tracking-wide">
                  How your anonymity works
                </h2>
                <ul className="space-y-2.5">
                  {[
                    { icon: "👤", text: "No name or email is ever asked for" },
                    { icon: "🔑", text: "You're identified by a random code stored in this browser only" },
                    { icon: "👁", text: "Your teacher sees questions, not who asked them" },
                    { icon: "🌐", text: "Your IP address is handled by your network in the usual way — we don't log it" },
                  ].map(({ icon, text }) => (
                    <li key={text} className="flex items-start gap-2.5 text-sm text-ink-subtle">
                      <span aria-hidden="true" className="shrink-0 text-base leading-none mt-0.5">{icon}</span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Teacher entry point */}
            <p className="mt-6 text-center text-xs text-ink-faint">
              Are you a teacher?{" "}
              <Link href="/teacher/new" className="text-teal underline underline-offset-2 hover:text-teal-dark">
                Create a lecture
              </Link>
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <JoinContent />
    </Suspense>
  );
}
