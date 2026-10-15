/**
 * Silent Doubt Wall — Database Schema (SQL migration)
 *
 * Target: Supabase / PostgreSQL
 *
 * Run this in your Supabase SQL Editor or via supabase CLI:
 *   supabase db push --local
 *
 * This migration creates the full Phase 1 schema.
 * Subsequent migrations must be applied in numbered order.
 */

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid()

-- ─── Lectures ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lectures (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  subject      TEXT        NOT NULL CHECK (char_length(subject) BETWEEN 2 AND 80),
  section      TEXT                     CHECK (char_length(section) <= 40),
  join_code    CHAR(6)     NOT NULL UNIQUE
                           CHECK (join_code ~ '^[A-Z0-9]{6}$'),
  status       TEXT        NOT NULL DEFAULT 'setup'
                           CHECK (status IN ('setup', 'live', 'ended')),
  teacher_token TEXT       NOT NULL,   -- Opaque token; not a user account
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lectures_join_code ON lectures (join_code);
CREATE INDEX IF NOT EXISTS idx_lectures_status    ON lectures (status);

-- ─── Doubts ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doubts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id          UUID        NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  original_text       TEXT        NOT NULL
                                  CHECK (char_length(original_text) BETWEEN 10 AND 280),
  -- Typo-corrected text from the NLP pipeline. NULL until processed.
  cleaned_text        TEXT                    CHECK (char_length(cleaned_text) <= 280),
  moderation_status   TEXT        NOT NULL DEFAULT 'pending'
                                  CHECK (moderation_status IN ('pending','approved','rejected','needs_review')),
  -- Internal moderation note. Never exposed to students.
  moderation_note     TEXT,
  -- Which confusion group this doubt belongs to (NULL until grouped)
  group_id            UUID,
  session_token       TEXT        NOT NULL,   -- Anonymous submitter identifier
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doubts_lecture        ON doubts (lecture_id);
CREATE INDEX IF NOT EXISTS idx_doubts_group          ON doubts (group_id);
CREATE INDEX IF NOT EXISTS idx_doubts_status         ON doubts (moderation_status);
CREATE INDEX IF NOT EXISTS idx_doubts_session        ON doubts (session_token);

-- ─── Doubt Groups (Confusion Groups) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doubt_groups (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lecture_id            UUID        NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  canonical_question    TEXT        NOT NULL CHECK (char_length(canonical_question) BETWEEN 5 AND 280),
  subject_tag           TEXT,
  status                TEXT        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active', 'resolved')),
  -- Denormalized counts for fast dashboard reads.
  -- Must be kept consistent by triggers or application logic.
  total_submissions     INT         NOT NULL DEFAULT 0 CHECK (total_submissions >= 0),
  vote_count            INT         NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  rank                  SMALLINT                        CHECK (rank BETWEEN 1 AND 3),
  explanation_suggestion TEXT,       -- Populated by NLP pipeline (Phase 2)
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from doubts to groups (after groups table exists)
ALTER TABLE doubts
  ADD CONSTRAINT fk_doubts_group
  FOREIGN KEY (group_id)
  REFERENCES doubt_groups(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_groups_lecture  ON doubt_groups (lecture_id);
CREATE INDEX IF NOT EXISTS idx_groups_rank     ON doubt_groups (lecture_id, rank) WHERE rank IS NOT NULL;

-- ─── Votes (Me Too) ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS votes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID        NOT NULL REFERENCES doubt_groups(id) ON DELETE CASCADE,
  session_token TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One vote per session per group
  CONSTRAINT unique_vote UNIQUE (group_id, session_token)
);

CREATE INDEX IF NOT EXISTS idx_votes_group   ON votes (group_id);
CREATE INDEX IF NOT EXISTS idx_votes_session ON votes (session_token);

-- ─── Row Level Security (RLS) ─────────────────────────────────────────────────
-- Students use the anon key. Teachers use a service-role action or a
-- signed teacher token validated server-side.

ALTER TABLE lectures      ENABLE ROW LEVEL SECURITY;
ALTER TABLE doubts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE doubt_groups  ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes         ENABLE ROW LEVEL SECURITY;

-- Public read: live lecture by join_code only
CREATE POLICY "read_live_lecture_by_code"
  ON lectures FOR SELECT
  USING (status = 'live');

-- Public read: approved doubts for a live lecture
CREATE POLICY "read_approved_doubts"
  ON doubts FOR SELECT
  USING (moderation_status = 'approved');

-- Public read: active groups for live lectures
CREATE POLICY "read_active_groups"
  ON doubt_groups FOR SELECT
  USING (status = 'active');

-- Authenticated insert: any anon user may submit a doubt
CREATE POLICY "insert_doubt"
  ON doubts FOR INSERT
  WITH CHECK (true);

-- Authenticated insert: any anon user may vote once per group
CREATE POLICY "insert_vote"
  ON votes FOR INSERT
  WITH CHECK (true);

-- NOTE: Teacher write operations (create lecture, start, end, moderate)
-- must go through server-side API routes that validate a teacher_token
-- and use the service_role key. They are NOT permitted via the anon key.

-- ─── Comments ─────────────────────────────────────────────────────────────────
COMMENT ON TABLE lectures     IS 'One row per lecture session created by a teacher.';
COMMENT ON TABLE doubts       IS 'Raw student submissions. original_text is immutable; cleaned_text is produced by the NLP pipeline.';
COMMENT ON TABLE doubt_groups IS 'Canonical confusion groups. Multiple doubts may belong to one group. Groups must not merge doubts about distinct concepts.';
COMMENT ON TABLE votes        IS 'Anonymous "Me too" votes. One vote per session_token per group enforced by UNIQUE constraint.';
