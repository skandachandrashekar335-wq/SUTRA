"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ─── Wordmark / Logo ──────────────────────────────────────────────────────────

export function Wordmark({ className = "", size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const iconSize = size === "sm" ? "w-7 h-7" : size === "lg" ? "w-11 h-11" : "w-8 h-8";
  const textSize = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-lg";
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/sutra-logo.png"
        alt=""
        aria-hidden="true"
        className={`${iconSize} object-contain rounded-md`}
      />
      <span className={`font-display ${textSize} tracking-wide leading-none font-medium`}>
        SUTRA
      </span>
    </span>
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export function SiteNav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;

  return (
    <nav
      className="sticky top-0 z-40 border-b border-border bg-paper/95 backdrop-blur-sm"
      aria-label="Main navigation"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-ink hover:text-teal transition-colors focus-visible:rounded-sm"
          aria-label="SUTRA home"
        >
          <Wordmark />
        </Link>

        {/* Desktop nav links */}
        <div className="hidden sm:flex items-center gap-1 text-sm">
          <Link
            href="/teacher/new"
            className={`px-3 py-1.5 rounded-md transition-colors focus-visible:rounded-md ${
              isActive("/teacher/new")
                ? "bg-teal-light text-teal font-medium"
                : "text-ink-subtle hover:text-ink hover:bg-surface"
            }`}
          >
            For Teachers
          </Link>
          <Link
            href="/join"
            className={`px-3 py-1.5 rounded-md transition-colors focus-visible:rounded-md ${
              isActive("/join")
                ? "bg-teal-light text-teal font-medium"
                : "text-ink-subtle hover:text-ink hover:bg-surface"
            }`}
          >
            For Students
          </Link>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          {/* Mobile: show only Join */}
          <Link
            href="/join"
            className={`sm:hidden px-3 py-1.5 text-sm rounded-md transition-colors focus-visible:rounded-md ${
              isActive("/join")
                ? "bg-teal-light text-teal font-medium"
                : "text-ink-subtle hover:text-ink hover:bg-surface"
            }`}
          >
            Join
          </Link>
          <Link
            href="/teacher/new"
            className="px-3 py-1.5 text-sm rounded-md bg-teal text-white font-medium hover:bg-teal-dark transition-colors focus-visible:rounded-md"
          >
            Start a lecture
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Live Status Badge ────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: "live" | "setup" | "ended" | "approved" | "pending" | "rejected" | "needs_review";
  size?: "sm" | "md";
}

const STATUS_CONFIG = {
  live:         { label: "Live",        bg: "bg-amber-light",    text: "text-amber-dark",  dot: true  },
  setup:        { label: "Setup",       bg: "bg-surface",        text: "text-ink-subtle",  dot: false },
  ended:        { label: "Ended",       bg: "bg-surface",        text: "text-ink-faint",   dot: false },
  approved:     { label: "Approved",    bg: "bg-emerald-light",  text: "text-emerald",     dot: false },
  pending:      { label: "Pending",     bg: "bg-slate-light",    text: "text-slate",       dot: false },
  rejected:     { label: "Rejected",   bg: "bg-rose-light",     text: "text-rose",        dot: false },
  needs_review: { label: "Review",     bg: "bg-purple-100",     text: "text-purple-700",  dot: false },
} as const;

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  const sizeClasses = size === "sm"
    ? "px-2 py-0.5 text-xs"
    : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClasses} ${cfg.bg} ${cfg.text}`}
    >
      {cfg.dot && (
        <span
          aria-hidden="true"
          className="inline-block w-1.5 h-1.5 rounded-full bg-current live-dot"
        />
      )}
      {cfg.label}
    </span>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children: React.ReactNode;
}

const BUTTON_VARIANTS = {
  primary:   "bg-teal text-white hover:bg-teal-dark disabled:bg-teal/50",
  secondary: "bg-surface text-ink border border-border hover:bg-surface-2 disabled:opacity-50",
  ghost:     "text-ink-subtle hover:text-ink hover:bg-surface disabled:opacity-40",
  danger:    "bg-rose text-white hover:bg-rose-800 disabled:bg-rose/50",
};

const BUTTON_SIZES = {
  sm: "px-3 py-1.5 text-sm gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  children,
  className = "",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:rounded-lg ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
    >
      {loading && (
        <span aria-hidden="true" className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function Input({
  label,
  error,
  hint,
  id,
  className = "",
  ...props
}: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-ink"
      >
        {label}
        {props.required && (
          <span className="ml-1 text-rose" aria-hidden="true">*</span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      )}
      <input
        id={inputId}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={!!error}
        className={`w-full rounded-lg border px-3.5 py-2.5 text-sm bg-paper text-ink placeholder:text-ink-faint transition-colors
          ${error
            ? "border-rose focus:border-rose focus:ring-1 focus:ring-rose/50 focus:outline-none"
            : "border-border focus:border-teal focus:ring-2 focus:ring-teal/20 focus:outline-none"
          } ${className}`}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs text-rose flex items-center gap-1">
          <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a.75.75 0 01.75.75v4a.75.75 0 01-1.5 0v-4A.75.75 0 018 4zm0 8a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  charLimit?: number;
  currentLength?: number;
}

export function Textarea({
  label,
  error,
  hint,
  id,
  charLimit,
  currentLength = 0,
  className = "",
  ...props
}: TextareaProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, "-");
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const nearLimit = charLimit ? currentLength > charLimit * 0.85 : false;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label htmlFor={inputId} className="text-sm font-medium text-ink">
          {label}
          {props.required && (
            <span className="ml-1 text-rose" aria-hidden="true">*</span>
          )}
        </label>
        {charLimit && (
          <span
            className={`text-xs tabular-nums ${
              nearLimit ? "text-amber" : "text-ink-faint"
            }`}
            aria-live="polite"
          >
            {currentLength}/{charLimit}
          </span>
        )}
      </div>
      {hint && (
        <p id={hintId} className="text-xs text-ink-faint">
          {hint}
        </p>
      )}
      <textarea
        id={inputId}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={!!error}
        className={`w-full rounded-lg border px-3.5 py-2.5 text-sm bg-paper text-ink placeholder:text-ink-faint resize-none transition-colors
          ${error
            ? "border-rose focus:border-rose focus:ring-1 focus:ring-rose/50 focus:outline-none"
            : "border-border focus:border-teal focus:ring-2 focus:ring-teal/20 focus:outline-none"
          } ${className}`}
        {...props}
      />
      {error && (
        <p id={errorId} role="alert" className="text-xs text-rose flex items-center gap-1">
          <svg aria-hidden="true" className="w-3.5 h-3.5 shrink-0" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a.75.75 0 01.75.75v4a.75.75 0 01-1.5 0v-4A.75.75 0 018 4zm0 8a1 1 0 110-2 1 1 0 010 2z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 gap-4">
      {icon && (
        <div className="text-ink-faint w-12 h-12 flex items-center justify-center">
          {icon}
        </div>
      )}
      <div className="max-w-xs">
        <p className="font-medium text-ink">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-ink-subtle">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-surface-2 rounded-md ${className}`}
    />
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────

export function Divider({ label }: { label?: string }) {
  if (!label) {
    return <hr className="border-t border-border" />;
  }
  return (
    <div className="relative flex items-center gap-3">
      <hr className="flex-1 border-t border-border" />
      <span className="text-xs text-ink-faint whitespace-nowrap">{label}</span>
      <hr className="flex-1 border-t border-border" />
    </div>
  );
}

// ─── Alert Banner ─────────────────────────────────────────────────────────────

interface AlertProps {
  type: "info" | "success" | "warning" | "error";
  children: React.ReactNode;
}

const ALERT_STYLES = {
  info:    "bg-teal-light text-teal border border-teal/20",
  success: "bg-emerald-light text-emerald border border-emerald/20",
  warning: "bg-amber-light text-amber-dark border border-amber/20",
  error:   "bg-rose-light text-rose border border-rose/20",
};

export function Alert({ type, children }: AlertProps) {
  return (
    <div
      role="alert"
      className={`rounded-lg px-4 py-3 text-sm ${ALERT_STYLES[type]}`}
    >
      {children}
    </div>
  );
}
