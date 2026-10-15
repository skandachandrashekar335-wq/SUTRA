import crypto from "crypto";

const COOKIE_NAME_PREFIX = "sdw_t_";

export interface TeacherSession {
  lectureId: string;
  tokenHash: string;
  issuedAt: number;
}

/**
 * Get secret key for signing teacher session cookies.
 * Falls back to an environment-stable hash if not explicitly set.
 */
function getSigningSecret(): string {
  const secret = process.env.TEACHER_SESSION_SECRET;
  if (secret && secret.length >= 16) {
    return secret;
  }
  // Fallback for development/testing if TEACHER_SESSION_SECRET is omitted
  return "silent-doubt-wall-dev-teacher-session-secret-salt-2026";
}

/**
 * Generate a cryptographically strong, random 256-bit teacher secret.
 */
export function generateTeacherSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Compute SHA-256 hash of a teacher secret to store in the database.
 */
export function hashTeacherSecret(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

/**
 * Sign a payload with HMAC-SHA256.
 */
function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Create a signed, tamper-proof cookie value binding a teacher secret to a lecture.
 */
export function createTeacherCookieValue(lectureId: string, secret: string): string {
  const tokenHash = hashTeacherSecret(secret);
  const issuedAt = Date.now();
  const data = JSON.stringify({ lectureId, tokenHash, issuedAt });
  const base64Data = Buffer.from(data).toString("base64url");
  const signature = signPayload(base64Data, getSigningSecret());
  return `${base64Data}.${signature}`;
}

/**
 * Verify a teacher cookie value and return the session payload if valid.
 */
export function verifyTeacherCookieValue(cookieValue: string, expectedLectureId: string): TeacherSession | null {
  try {
    const parts = cookieValue.split(".");
    if (parts.length !== 2) return null;

    const [base64Data, signature] = parts;
    const expectedSig = signPayload(base64Data, getSigningSecret());

    if (!safeEqual(signature, expectedSig)) {
      return null;
    }

    const json = Buffer.from(base64Data, "base64url").toString("utf-8");
    const session: TeacherSession = JSON.parse(json);

    // Verify session binds to the exact requested lecture
    if (session.lectureId !== expectedLectureId) {
      return null;
    }

    // Sessions expire after 7 days
    const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - session.issuedAt > MAX_AGE_MS) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

/**
 * Cookie options for Next.js responses.
 */
export function getTeacherCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict" as const,
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  };
}

export function getTeacherCookieName(lectureId: string): string {
  return `${COOKIE_NAME_PREFIX}${lectureId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
