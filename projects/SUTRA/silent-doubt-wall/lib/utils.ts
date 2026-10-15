import { JOIN_CODE_LENGTH } from "./types";

/**
 * Generate a random alphanumeric join code (uppercase letters + digits only).
 * Length defined by JOIN_CODE_LENGTH constant.
 *
 * ⚠️ This is a client-safe utility — it does NOT use crypto.randomUUID(),
 * which requires a secure context. For production use, generate codes
 * server-side using crypto.getRandomValues or the Node.js crypto module.
 */
export function generateJoinCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Omit O, I, 0, 1 (visually ambiguous)
  const arr = new Uint8Array(JOIN_CODE_LENGTH);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    // Fallback for environments without crypto (tests, SSR without polyfill)
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(arr)
    .map((byte) => chars[byte % chars.length])
    .join("");
}

/**
 * Generate a per-session anonymous token for tracking a user's submissions
 * without storing any PII.
 *
 * Uses crypto.randomUUID() when available (secure context / Node 21+),
 * falls back to a UUID-v4-like random string.
 */
export function generateSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC 4122-like UUID v4 fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Normalise a raw join code input: uppercase, strip spaces.
 */
export function normalizeJoinCode(raw: string): string {
  return raw.toUpperCase().replace(/\s/g, "");
}

/**
 * Format a UTC ISO string to a human-readable time relative to now.
 * Kept intentionally simple; use `Intl.RelativeTimeFormat` for production.
 */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Get or create a persistent anonymous session token stored in localStorage.
 * Must only be called on the client side.
 */
export function getOrCreateSessionToken(): string {
  const STORAGE_KEY = "sdw_session";
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const token = generateSessionToken();
    window.localStorage.setItem(STORAGE_KEY, token);
    return token;
  } catch {
    // localStorage unavailable (private mode, etc.)
    return generateSessionToken();
  }
}

/**
 * Build the student join URL for a lecture, given a join code.
 * Returns null if NEXT_PUBLIC_APP_URL is not configured, to avoid
 * fabricating a non-functional URL.
 */
export function buildJoinUrl(joinCode: string): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/join/${joinCode}`;
}

/**
 * Pluralise a count label.
 */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? singular + "s")}`;
}

/**
 * Clamp a string to a maximum character length for display.
 */
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "…";
}
