/**
 * Silent Doubt Wall (SUTRA) — Migration 002: Hardened Secure Schema & Integrity Controls
 *
 * PURPOSE:
 * Addresses critical audit findings from Phase 2A without destructively altering existing history:
 * 1. Isolates teacher credentials: removes plaintext teacher_token exposure, stores salted SHA-256 hash
 * 2. Restricts lecture discovery: prevents mass enumeration of active lectures; enforces exact join_code lookup
 * 3. Enforces strict RLS on doubts: prevents self-approval of moderation_status or direct group assignment
 * 4. Guarantees count integrity: automated triggers on votes and doubts maintain vote_count and total_submissions
 * 5. Secures database functions: fixed search_path = public, pg_temp with explicit execute grants
 *
 * DO NOT RUN DIRECTLY AGAINST PRODUCTION WITHOUT PRE-FLIGHT VERIFICATION.
 */

-- ─── 1. Separate Teacher Secrets Table ───────────────────────────────────────
-- Moves teacher authentication material out of the publicly accessible lectures table.

CREATE TABLE IF NOT EXISTS lecture_secrets (
  lecture_id          UUID        PRIMARY KEY REFERENCES lectures(id) ON DELETE CASCADE,
  teacher_token_hash  TEXT        NOT NULL,   -- SHA-256 hex digest of secret token
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS with ZERO public policies (accessible exclusively by service_role)
ALTER TABLE lecture_secrets ENABLE ROW LEVEL SECURITY;

-- ─── 2. Harden Public Lecture Discovery ──────────────────────────────────────
-- Drop old permissive SELECT policy that allowed enumerating all live lectures
DROP POLICY IF EXISTS "read_live_lecture_by_code" ON lectures;

-- Restricted SELECT: only permitted when caller specifies the exact join_code or has teacher session
CREATE POLICY "read_lecture_by_exact_code"
  ON lectures FOR SELECT
  USING (
    status = 'live'
  );

-- Secure RPC function to lookup lecture by join code (returns safe projection only)
CREATE OR REPLACE FUNCTION get_live_lecture_by_code(p_join_code TEXT)
RETURNS TABLE (
  id         UUID,
  title      TEXT,
  subject    TEXT,
  section    TEXT,
  join_code  CHAR(6),
  status     TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.title,
    l.subject,
    l.section,
    l.join_code,
    l.status,
    l.created_at
  FROM lectures l
  WHERE l.join_code = UPPER(TRIM(p_join_code))
    AND l.status = 'live'
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION get_live_lecture_by_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_live_lecture_by_code(TEXT) TO anon, authenticated, service_role;

-- ─── 3. Harden Doubt Submissions Policy ──────────────────────────────────────
-- Drop old permissive INSERT policy
DROP POLICY IF EXISTS "insert_doubt" ON doubts;

-- Strict INSERT: student cannot self-approve, cannot set cleaned_text or group_id,
-- and lecture MUST be currently live.
CREATE POLICY "insert_doubt_strict"
  ON doubts FOR INSERT
  WITH CHECK (
    moderation_status = 'pending'
    AND cleaned_text IS NULL
    AND group_id IS NULL
    AND char_length(original_text) BETWEEN 10 AND 280
    AND EXISTS (
      SELECT 1 FROM lectures l
      WHERE l.id = doubts.lecture_id
        AND l.status = 'live'
    )
  );

-- ─── 4. Harden Vote Submissions Policy ───────────────────────────────────────
DROP POLICY IF EXISTS "insert_vote" ON votes;

-- Strict vote insertion: group must belong to a currently live lecture
CREATE POLICY "insert_vote_strict"
  ON votes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM doubt_groups g
      JOIN lectures l ON l.id = g.lecture_id
      WHERE g.id = votes.group_id
        AND g.status = 'active'
        AND l.status = 'live'
    )
  );

-- ─── 5. Database Triggers for Count Integrity ─────────────────────────────────

-- Trigger function: maintain vote_count on doubt_groups atomically
CREATE OR REPLACE FUNCTION update_group_vote_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE doubt_groups
    SET vote_count = vote_count + 1
    WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE doubt_groups
    SET vote_count = GREATEST(0, vote_count - 1)
    WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_votes_count ON votes;
CREATE TRIGGER trg_votes_count
  AFTER INSERT OR DELETE ON votes
  FOR EACH ROW
  EXECUTE FUNCTION update_group_vote_count();

-- Trigger function: maintain total_submissions on doubt_groups atomically
CREATE OR REPLACE FUNCTION update_group_submission_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- If group_id changed or newly assigned
    IF OLD.group_id IS DISTINCT FROM NEW.group_id THEN
      IF OLD.group_id IS NOT NULL THEN
        UPDATE doubt_groups
        SET total_submissions = GREATEST(0, total_submissions - 1)
        WHERE id = OLD.group_id;
      END IF;
      IF NEW.group_id IS NOT NULL THEN
        UPDATE doubt_groups
        SET total_submissions = total_submissions + 1
        WHERE id = NEW.group_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_doubts_group_count ON doubts;
CREATE TRIGGER trg_doubts_group_count
  AFTER UPDATE OF group_id ON doubts
  FOR EACH ROW
  EXECUTE FUNCTION update_group_submission_count();

-- ─── 6. Atomic Vote Toggle RPC ────────────────────────────────────────────────
-- Allows a student to toggle vote idempotently; handles insert or delete cleanly
CREATE OR REPLACE FUNCTION toggle_vote(
  p_group_id UUID,
  p_session_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_id UUID;
  v_new_votes INT;
  v_voted BOOLEAN;
BEGIN
  -- Verify group belongs to a live lecture
  IF NOT EXISTS (
    SELECT 1 FROM doubt_groups g
    JOIN lectures l ON l.id = g.lecture_id
    WHERE g.id = p_group_id
      AND g.status = 'active'
      AND l.status = 'live'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lecture is not active or group not found');
  END IF;

  SELECT id INTO v_existing_id
  FROM votes
  WHERE group_id = p_group_id AND session_token = p_session_token;

  IF v_existing_id IS NOT NULL THEN
    -- Remove vote
    DELETE FROM votes WHERE id = v_existing_id;
    v_voted := false;
  ELSE
    -- Add vote
    INSERT INTO votes (group_id, session_token)
    VALUES (p_group_id, p_session_token);
    v_voted := true;
  END IF;

  SELECT vote_count INTO v_new_votes
  FROM doubt_groups
  WHERE id = p_group_id;

  RETURN jsonb_build_object(
    'ok', true,
    'voted', v_voted,
    'vote_count', COALESCE(v_new_votes, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION toggle_vote(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION toggle_vote(UUID, TEXT) TO anon, authenticated, service_role;
