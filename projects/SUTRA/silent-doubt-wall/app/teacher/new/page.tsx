"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SiteNav, Input, Button, Alert, Wordmark } from "@/components/ui";
import { createLectureSchema } from "@/lib/validation";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  title: string;
  subject: string;
  section: string;
}

interface FieldErrors {
  title?: string;
  subject?: string;
  section?: string;
}

// ─── Common subject suggestions ───────────────────────────────────────────────

const SUBJECT_SUGGESTIONS = [
  "Mathematics", "Statistics", "Physics", "Chemistry",
  "Biology", "Computer Science", "Economics", "History",
  "Literature", "Engineering", "Data Structures", "Calculus",
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewLecturePage() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>({
    title: "",
    subject: "",
    section: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const filteredSuggestions = SUBJECT_SUGGESTIONS.filter((s) =>
    s.toLowerCase().includes(form.subject.toLowerCase())
  );

  // ── Field change ────────────────────────────────────────────────────────────

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear field error on change
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (submitError) setSubmitError(null);
  }

  // ── Validate ────────────────────────────────────────────────────────────────

  function validate(): boolean {
    const result = createLectureSchema.safeParse({
      title: form.title,
      subject: form.subject,
      section: form.section || undefined,
    });
    if (result.success) {
      setErrors({});
      return true;
    }
    const fieldErrors: FieldErrors = {};
    for (const issue of result.error.issues) {
      const field = issue.path[0] as keyof FieldErrors;
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    setErrors(fieldErrors);
    return false;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/lectures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          subject: form.subject.trim(),
          section: form.section.trim() || undefined,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.ok) {
        setSubmitError(json.error || "Failed to create lecture. Please try again.");
        setIsSubmitting(false);
        return;
      }

      // Also cache to sessionStorage for instant fallback
      if (typeof window !== "undefined") {
        sessionStorage.setItem("sdw_lecture", JSON.stringify(json.data));
      }

      router.push(`/teacher/${json.data.id}/dashboard`);
    } catch {
      setSubmitError("Network connection error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <SiteNav />
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-lg">

          {/* Page header */}
          <div className="mb-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-sm text-ink-faint hover:text-ink-subtle transition-colors mb-6"
            >
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 12L6 8l4-4" />
              </svg>
              Back
            </Link>
            <h1 className="font-display text-3xl text-ink mb-2">Start a lecture</h1>
            <p className="text-sm text-ink-subtle">
              A unique join code and QR code are generated automatically.
              Students join by scanning — no app download required.
            </p>
          </div>

          {/* Form card */}
          <div className="rounded-xl border border-border bg-paper shadow-sm p-6 sm:p-8">
            {submitError && (
              <div className="mb-6">
                <Alert type="error">{submitError}</Alert>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-5">
              <Input
                label="Lecture title"
                placeholder="e.g. Measures of Central Tendency"
                required
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                error={errors.title}
                autoComplete="off"
                maxLength={120}
              />

              {/* Subject with suggestions */}
              <div className="relative">
                <Input
                  label="Subject"
                  placeholder="e.g. Statistics"
                  required
                  value={form.subject}
                  onChange={(e) => {
                    handleChange("subject", e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => {
                    // Delay to allow suggestion click to register
                    setTimeout(() => setShowSuggestions(false), 150);
                  }}
                  error={errors.subject}
                  autoComplete="off"
                  maxLength={80}
                />
                {showSuggestions && filteredSuggestions.length > 0 && form.subject.length > 0 && (
                  <ul
                    role="listbox"
                    aria-label="Subject suggestions"
                    className="absolute z-20 left-0 right-0 mt-1 bg-paper border border-border rounded-lg shadow-md overflow-hidden max-h-48 overflow-y-auto"
                  >
                    {filteredSuggestions.map((s) => (
                      <li key={s}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={form.subject === s}
                          className="w-full text-left px-3.5 py-2.5 text-sm text-ink hover:bg-surface focus:bg-surface focus:outline-none"
                          onMouseDown={() => {
                            handleChange("subject", s);
                            setShowSuggestions(false);
                          }}
                        >
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Input
                label="Class / section"
                placeholder="e.g. BCA Sem 3 — Section A (optional)"
                value={form.section}
                onChange={(e) => handleChange("section", e.target.value)}
                error={errors.section}
                autoComplete="off"
                maxLength={40}
                hint="Helps students confirm they're in the right lecture."
              />

              {/* Active session notice */}
              <div className="rounded-lg bg-teal-light/40 border border-teal/20 px-4 py-3 text-xs text-ink-subtle">
                <strong>Active Classroom Session:</strong> Creating this lecture generates a unique 6-character room code and QR code. Students can join instantly from any phone or browser.
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isSubmitting}
                className="w-full mt-2"
              >
                {isSubmitting ? "Creating lecture…" : "Create lecture & get join code"}
              </Button>
            </form>
          </div>

          {/* Student entry point */}
          <p className="mt-6 text-center text-sm text-ink-faint">
            Are you a student?{" "}
            <Link href="/join" className="text-teal underline underline-offset-2 hover:text-teal-dark">
              Join with a code
            </Link>
          </p>
        </div>
      </main>

      {/* Footer wordmark */}
      <div className="py-8 flex justify-center border-t border-border">
        <Link href="/" aria-label="SUTRA home">
          <Wordmark className="text-ink-faint hover:text-ink transition-colors text-sm" />
        </Link>
      </div>
    </>
  );
}
