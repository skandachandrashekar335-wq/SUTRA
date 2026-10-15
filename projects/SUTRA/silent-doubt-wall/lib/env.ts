/**
 * SUTRA — Centralized Server-Side Environment Configuration
 *
 * Validates required configuration at startup.
 * Never logs secret values — only names missing variables.
 * Allows optional AI integrations to be absent without crashing the app.
 */

// ─── Infrastructure (required for the app to function) ────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`[SUTRA] Missing required environment variable: ${name}`);
  }
  return val;
}

function optionalEnv(name: string): string | undefined {
  return process.env[name] || undefined;
}

// ─── Supabase ─────────────────────────────────────────────────────────────────

export function getSupabasePublicUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseAnonKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function getSupabaseServiceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export function getTeacherSessionSecret(): string {
  return (
    process.env.TEACHER_SESSION_SECRET ||
    "silent-doubt-wall-dev-teacher-session-secret-salt-2026"
  );
}

// ─── AI Providers ─────────────────────────────────────────────────────────────

export function getGeminiApiKey(): string | undefined {
  return optionalEnv("GEMINI_API_KEY");
}

export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-1.5-flash";
}

export function getOpenRouterApiKey(): string | undefined {
  return optionalEnv("OPENROUTER_API_KEY");
}

export function getOpenRouterModel(): string {
  return process.env.OPENROUTER_MODEL || "mistralai/mistral-7b-instruct:free";
}

export function getOpenRouterBaseUrl(): string {
  return process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
}

export function getAiPrimaryProvider(): "gemini" | "openrouter" {
  const p = process.env.AI_PRIMARY_PROVIDER;
  return p === "openrouter" ? "openrouter" : "gemini";
}

export function getAiRequestTimeoutMs(): number {
  const v = parseInt(process.env.AI_REQUEST_TIMEOUT_MS || "20000", 10);
  return isNaN(v) ? 20000 : v;
}

export function getAiMaxRetries(): number {
  const v = parseInt(process.env.AI_MAX_RETRIES || "1", 10);
  return isNaN(v) ? 1 : v;
}

export function getSchedulerSecret(): string | undefined {
  return optionalEnv("SUTRA_SCHEDULER_SECRET");
}

// ─── Feature availability ─────────────────────────────────────────────────────

export interface FeatureAvailability {
  supabase: boolean;
  gemini: boolean;
  openRouter: boolean;
  aiAvailable: boolean;
  scheduler: boolean;
}

export function getFeatureAvailability(): FeatureAvailability {
  const gemini = Boolean(getGeminiApiKey());
  const openRouter = Boolean(getOpenRouterApiKey());
  return {
    supabase: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
        process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
    gemini,
    openRouter,
    aiAvailable: gemini || openRouter,
    scheduler: Boolean(getSchedulerSecret()),
  };
}

// ─── Safe Diagnostics (for development/authorized use only) ───────────────────

export function getSystemDiagnostics(): Record<string, string> {
  const f = getFeatureAvailability();
  return {
    supabase: f.supabase ? "configured" : "missing",
    gemini: f.gemini ? "configured" : "missing",
    openrouter: f.openRouter ? "configured" : "missing",
    scheduler: f.scheduler ? "configured" : "missing",
    ai: f.aiAvailable ? "available" : "unavailable",
    node_env: process.env.NODE_ENV || "unknown",
  };
}
