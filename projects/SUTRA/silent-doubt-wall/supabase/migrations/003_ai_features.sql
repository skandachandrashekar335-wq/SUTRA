/**
 * SUTRA — Migration 003: AI Features Schema
 *
 * Adds tables for:
 * - lecture_documents: metadata for uploaded teacher documents
 * - document_chunks: extracted text chunks for full-text search / RAG
 * - ai_answers: AI-generated answers with citations and status
 * - ai_usage_events: lightweight token/cost tracking
 *
 * Apply AFTER 001_initial_schema.sql and 002_secure_schema.sql.
 *
 * Run in Supabase SQL Editor:
 *   Paste this file and execute.
 *
 * This migration is ADDITIVE — it never drops existing tables or data.
 */

-- ─── Extensions ──────────────────────────────────────────────────────────────
-- pgcrypto already enabled by migration 001
-- Enable pg_trgm for better full-text similarity
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── Lecture Documents ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lecture_documents (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id        UUID        NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  filename          TEXT        NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 200),
  storage_key       TEXT        NOT NULL UNIQUE,   -- Supabase Storage path
  mime_type         TEXT        NOT NULL,
  page_count        INTEGER,
  extraction_status TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (extraction_status IN ('pending','success','failed','image_pdf')),
  chunk_count       INTEGER     NOT NULL DEFAULT 0,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lecture_docs_lecture ON lecture_documents (lecture_id);

-- RLS: only service_role can read/write documents (no public access)
ALTER TABLE lecture_documents ENABLE ROW LEVEL SECURITY;

-- ─── Document Chunks ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS document_chunks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     UUID        NOT NULL REFERENCES lecture_documents(id) ON DELETE CASCADE,
  lecture_id      UUID        NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  text            TEXT        NOT NULL CHECK (char_length(text) > 0),
  source_ref      TEXT        NOT NULL DEFAULT '',  -- e.g. 'page 3', 'slide 7'
  chunk_index     INTEGER     NOT NULL DEFAULT 0,
  -- Full-text search vector, auto-updated by trigger below
  tsv             TSVECTOR    GENERATED ALWAYS AS (to_tsvector('english', text)) STORED
);

CREATE INDEX IF NOT EXISTS idx_chunks_lecture    ON document_chunks (lecture_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document   ON document_chunks (document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tsv        ON document_chunks USING GIN (tsv);

-- RLS: only service_role
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- ─── AI Answers ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_answers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID        NOT NULL REFERENCES doubt_groups(id) ON DELETE CASCADE,
  lecture_id      UUID        NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  answer_text     TEXT        NOT NULL,
  citations       JSONB       NOT NULL DEFAULT '[]',  -- [{sourceRef, snippet}]
  confidence      TEXT        NOT NULL DEFAULT 'medium'
                              CHECK (confidence IN ('high','medium','low')),
  provider        TEXT        NOT NULL,
  model           TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'published'
                              CHECK (status IN ('published','flagged','replaced')),
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Teacher review
  teacher_reviewed_at TIMESTAMPTZ,
  teacher_note    TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_answers_group   ON ai_answers (group_id);
CREATE INDEX IF NOT EXISTS idx_ai_answers_lecture ON ai_answers (lecture_id);

ALTER TABLE ai_answers ENABLE ROW LEVEL SECURITY;

-- Public can read published answers for active lectures via function only
CREATE POLICY "read_ai_answers_by_service"
  ON ai_answers FOR SELECT
  USING (false);  -- Enforced via service_role in API routes

-- ─── AI Usage Events ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id    UUID        REFERENCES lectures(id) ON DELETE SET NULL,
  event_type    TEXT        NOT NULL,  -- 'refine', 'insights', 'rag_answer'
  provider      TEXT        NOT NULL,
  model         TEXT        NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  succeeded     BOOLEAN     NOT NULL DEFAULT true,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_lecture  ON ai_usage_events (lecture_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_recorded ON ai_usage_events (recorded_at);

ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;

-- ─── Supabase Storage: private bucket ────────────────────────────────────────
-- Run this separately in the Storage section of Supabase dashboard,
-- OR via the Supabase JS client in your app setup:
--
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('lecture-documents', 'lecture-documents', false)
-- ON CONFLICT (id) DO NOTHING;
--
-- Then add a service_role-only storage policy.

-- ─── Grants ───────────────────────────────────────────────────────────────────
-- These tables are accessed via service_role only (no anon/authenticated grants)
-- No GRANT needed — service_role bypasses RLS by default.
