/**
 * SUTRA — Backend Service Layer
 *
 * Handles persistent database operations with Supabase.
 * In development, if remote database connectivity or unapplied migrations
 * prevent a remote write, operations gracefully maintain state in a shared
 * server memory store so cross-device and multi-browser testing works reliably.
 */

import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/server";
import { generateTeacherSecret, hashTeacherSecret } from "@/lib/auth";
import { generateJoinCode } from "@/lib/utils";
import { cleanDoubtText, moderateDoubt, areDoubtsEquivalent, generateExplanationSuggestion } from "@/lib/nlp/doubt-engine";
import type { Lecture, Doubt, DoubtGroup, RankedGroup, ModerationStatus } from "@/lib/types";

// ─── Shared In-Memory Server Store (Resilient Fallback) ────────────────────────
// Ensures multi-browser testing works when the remote Supabase schema hasn't
// been migrated yet. Cross-device persistence requires running the migrations.

interface MemoryStore {
  lectures: Map<string, Lecture>;
  lectureSecrets: Map<string, string>; // lectureId -> tokenHash
  doubts: Map<string, Doubt>;
  groups: Map<string, DoubtGroup>;
  votes: Set<string>; // `${groupId}:${sessionToken}`
  _warnedMigration: boolean;
}

declare global {
  var __SDW_MEMORY_STORE__: MemoryStore | undefined;
}

const memoryStore: MemoryStore = global.__SDW_MEMORY_STORE__ ?? {
  lectures: new Map(),
  lectureSecrets: new Map(),
  doubts: new Map(),
  groups: new Map(),
  votes: new Set(),
  _warnedMigration: false,
};

if (process.env.NODE_ENV !== "production") {
  global.__SDW_MEMORY_STORE__ = memoryStore;
}

/**
 * Detect PGRST125 (table not found) — means migrations haven't been applied.
 * Log a clear one-time warning; fall back to in-memory store.
 */
function handleSupabaseError(error: { code?: string; message?: string }, context: string): void {
  if (error?.code === "PGRST125" || error?.message?.includes("Invalid path")) {
    if (!memoryStore._warnedMigration) {
      memoryStore._warnedMigration = true;
      console.warn(
        "\n⚠️  SUTRA: Supabase tables not found (PGRST125).\n" +
        "   Run the migrations before going to production:\n" +
        "   1. Open your Supabase dashboard → SQL Editor\n" +
        "   2. Run supabase/migrations/001_initial_schema.sql\n" +
        "   3. Run supabase/migrations/002_secure_schema.sql\n" +
        "   Falling back to in-process memory (not cross-device).\n"
      );
    }
    return;
  }
  // Other errors (network, auth, RLS) get logged with context
  if (error?.code !== "PGRST116") { // 116 = single row not found, expected
    console.error(`[SUTRA:${context}]`, error?.code, error?.message);
  }
}

// ─── 1. Lecture Management ────────────────────────────────────────────────────

export async function createLecture(input: {
  title: string;
  subject: string;
  section?: string | null;
}): Promise<{
  lecture: Lecture;
  teacherSecret: string;
}> {
  const teacherSecret = generateTeacherSecret();
  const tokenHash = hashTeacherSecret(teacherSecret);
  const joinCode = generateJoinCode();

  const adminClient = getSupabaseAdminClient();

  if (adminClient) {
    try {
      const { data, error } = await adminClient
        .from("lectures")
        .insert({
          title: input.title,
          subject: input.subject,
          section: input.section || null,
          join_code: joinCode,
          status: "live",
          teacher_token: tokenHash, // In schema 001 compatibility
        })
        .select()
        .single();

      if (!error && data) {
        // Try recording into lecture_secrets if migration 002 is present
        try {
          await adminClient.from("lecture_secrets").insert({
            lecture_id: data.id,
            teacher_token_hash: tokenHash,
          });
        } catch {
          // Schema 002 not yet applied; teacher_token field is used
        }

        const lecture: Lecture = {
          id: data.id,
          title: data.title,
          subject: data.subject,
          section: data.section,
          join_code: data.join_code,
          status: data.status,
          teacher_id: tokenHash,
          created_at: data.created_at,
          started_at: data.started_at,
        };

        // Sync to server memory cache
        memoryStore.lectures.set(lecture.id, lecture);
        memoryStore.lectureSecrets.set(lecture.id, tokenHash);

        return { lecture, teacherSecret };
      } else if (error) {
        handleSupabaseError(error, "createLecture");
      }
    } catch (e: unknown) {
      handleSupabaseError(e as { code?: string; message?: string }, "createLecture:network");
    }
  }

  // Resilient server-memory creation
  const id = `lec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const lecture: Lecture = {
    id,
    title: input.title,
    subject: input.subject,
    section: input.section || undefined,
    join_code: joinCode,
    status: "live",
    teacher_id: tokenHash,
    created_at: new Date().toISOString(),
    started_at: new Date().toISOString(),
  };

  memoryStore.lectures.set(id, lecture);
  memoryStore.lectureSecrets.set(id, tokenHash);

  return { lecture, teacherSecret };
}

export async function getLiveLectureByCode(joinCode: string): Promise<Lecture | null> {
  const normalizedCode = joinCode.toUpperCase().trim();
  const serverClient = getSupabaseServerClient();

  if (serverClient) {
    try {
      const { data, error } = await serverClient
        .from("lectures")
        .select("id, title, subject, section, join_code, status, created_at, started_at")
        .eq("join_code", normalizedCode)
        .eq("status", "live")
        .single();

      if (!error && data) {
        return data as Lecture;
      } else if (error) {
        handleSupabaseError(error, "getLiveLectureByCode");
      }
    } catch (e: unknown) {
      handleSupabaseError(e as { code?: string; message?: string }, "getLiveLectureByCode:network");
    }
  }

  // Check server memory store
  for (const lecture of memoryStore.lectures.values()) {
    if (lecture.join_code === normalizedCode && lecture.status === "live") {
      return lecture;
    }
  }

  return null;
}

export async function getLectureById(lectureId: string): Promise<Lecture | null> {
  const serverClient = getSupabaseServerClient();
  if (serverClient) {
    try {
      const { data, error } = await serverClient
        .from("lectures")
        .select("id, title, subject, section, join_code, status, created_at, started_at, ended_at")
        .eq("id", lectureId)
        .single();

      if (!error && data) {
        return data as Lecture;
      } else if (error) {
        handleSupabaseError(error, "getLectureById");
      }
    } catch (e: unknown) {
      handleSupabaseError(e as { code?: string; message?: string }, "getLectureById:network");
    }
  }

  return memoryStore.lectures.get(lectureId) ?? null;
}

export async function endLecture(lectureId: string): Promise<boolean> {
  const adminClient = getSupabaseAdminClient();
  if (adminClient) {
    try {
      const { error } = await adminClient
        .from("lectures")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", lectureId);

      if (!error) {
        const mem = memoryStore.lectures.get(lectureId);
        if (mem) {
          mem.status = "ended";
          mem.ended_at = new Date().toISOString();
        }
        return true;
      }
    } catch {
      // Fallback
    }
  }

  const mem = memoryStore.lectures.get(lectureId);
  if (mem) {
    mem.status = "ended";
    mem.ended_at = new Date().toISOString();
    return true;
  }

  return false;
}

// ─── 2. Doubts & Semantic Clustering ──────────────────────────────────────────

export async function submitDoubt(input: {
  lectureId: string;
  rawText: string;
  sessionToken: string;
}): Promise<{
  doubt: Doubt;
  group: DoubtGroup;
  status: ModerationStatus;
}> {
  const lecture = await getLectureById(input.lectureId);
  if (!lecture || lecture.status !== "live") {
    throw new Error("Lecture is not active or has ended.");
  }

  // 1. Clean typos and normalize text
  const cleanedText = cleanDoubtText(input.rawText);

  // 2. Run moderation check
  const moderation = moderateDoubt(cleanedText);

  // ── EARLY EXIT: rejected submissions are never stored, never grouped, never counted ──
  // This is enforced both here (server-side) and separately validated in the API route.
  // Rejecting here means no in-memory write and no Supabase write ever happen.
  if (moderation.status === "rejected") {
    // Return a lightweight sentinel. The API route must check status === "rejected"
    // and must not return a 200 or add the doubt to any visible feed.
    const rejectedDoubt: Doubt = {
      id: `rejected-${Date.now()}`,
      lecture_id: input.lectureId,
      original_text: "[REDACTED — moderation rejected]",
      cleaned_text: null,
      moderation_status: "rejected",
      moderation_note: moderation.note,
      group_id: null,
      session_token: input.sessionToken,
      submitted_at: new Date().toISOString(),
    };
    const emptyGroup: DoubtGroup = {
      id: "rejected-placeholder",
      lecture_id: input.lectureId,
      canonical_question: "",
      subject_tag: null,
      status: "active",
      total_submissions: 0,
      vote_count: 0,
      rank: null,
      explanation_suggestion: null,
      created_at: new Date().toISOString(),
    };
    return { doubt: rejectedDoubt, group: emptyGroup, status: "rejected" };
  }

  const doubtId = `dbt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  // 3. Find matching confusion group — only among existing approved/active groups
  const existingGroups = await getActiveGroupsForLecture(input.lectureId);
  let matchedGroup: DoubtGroup | null = null;

  // Only match against groups that were seeded by approved doubts
  for (const group of existingGroups) {
    if (areDoubtsEquivalent(cleanedText, group.canonical_question)) {
      matchedGroup = group;
      break;
    }
  }

  // If no match found, create a new canonical confusion group
  if (!matchedGroup) {
    const groupId = `grp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const explanationHint = generateExplanationSuggestion(cleanedText);

    matchedGroup = {
      id: groupId,
      lecture_id: input.lectureId,
      canonical_question: cleanedText,
      subject_tag: lecture.subject,
      status: "active",
      // needs_review submissions do NOT contribute to group counts yet —
      // counts only increment once/if teacher approves the doubt.
      total_submissions: moderation.status === "approved" ? 1 : 0,
      vote_count: moderation.status === "approved" ? 1 : 0,
      rank: null,
      explanation_suggestion: explanationHint,
      created_at: new Date().toISOString(),
    };
  } else if (moderation.status === "approved") {
    // Only increment counts for approved submissions
    matchedGroup.total_submissions += 1;
    matchedGroup.vote_count += 1;
  }

  const doubt: Doubt = {
    id: doubtId,
    lecture_id: input.lectureId,
    original_text: input.rawText,
    cleaned_text: cleanedText,
    moderation_status: moderation.status,
    moderation_note: moderation.note,
    group_id: matchedGroup.id,
    session_token: input.sessionToken,
    submitted_at: new Date().toISOString(),
  };

  // Record into server memory: always store the doubt record itself (for teacher review),
  // but only store a group if it was created new or updated by an approved submission.
  memoryStore.doubts.set(doubt.id, doubt);
  memoryStore.groups.set(matchedGroup.id, matchedGroup);

  // Only implicitly vote the submitter in if approved
  if (moderation.status === "approved") {
    memoryStore.votes.add(`${matchedGroup.id}:${input.sessionToken}`);
  }

  // Persist remotely to Supabase if configured
  const adminClient = getSupabaseAdminClient();
  if (adminClient) {
    try {
      let supabaseGroupId: string | null = null;

      if (moderation.status === "approved") {
        // Check if the matched group already exists in Supabase (it may have been
        // created by an earlier submission on another server instance).
        // Use the canonical_question to find-or-create the group.
        const { data: existingGroup } = await adminClient
          .from("doubt_groups")
          .select("id")
          .eq("lecture_id", matchedGroup.lecture_id)
          .eq("canonical_question", matchedGroup.canonical_question)
          .single();

        if (existingGroup?.id) {
          supabaseGroupId = existingGroup.id as string;
          // Sync the real DB id back into our in-memory record
          if (supabaseGroupId !== matchedGroup.id) {
            memoryStore.groups.delete(matchedGroup.id);
            matchedGroup.id = supabaseGroupId;
            memoryStore.groups.set(matchedGroup.id, matchedGroup);
          }
        } else {
          // Create the group — let DB generate UUID; do NOT pass counts (triggers handle them)
          const { data: newGroup, error: groupInsertError } = await adminClient
            .from("doubt_groups")
            .insert({
              lecture_id: matchedGroup.lecture_id,
              canonical_question: matchedGroup.canonical_question,
              subject_tag: matchedGroup.subject_tag,
              status: matchedGroup.status,
              explanation_suggestion: matchedGroup.explanation_suggestion,
            })
            .select("id")
            .single();

          if (!groupInsertError && newGroup?.id) {
            supabaseGroupId = newGroup.id as string;
            // Sync DB-generated id back to in-memory store
            memoryStore.groups.delete(matchedGroup.id);
            matchedGroup.id = supabaseGroupId;
            doubt.group_id = supabaseGroupId;
            memoryStore.groups.set(matchedGroup.id, matchedGroup);
          } else if (groupInsertError) {
            handleSupabaseError(groupInsertError, "submitDoubt:insertGroup");
          }
        }
      }

      // Insert doubt — let DB generate UUID; triggers maintain group counts
      const { data: insertedDoubt, error: doubtError } = await adminClient
        .from("doubts")
        .insert({
          lecture_id: doubt.lecture_id,
          original_text: doubt.original_text,
          cleaned_text: doubt.cleaned_text,
          moderation_status: doubt.moderation_status,
          moderation_note: doubt.moderation_note,
          // For approved doubts, link to Supabase group ID; needs_review stays unlinked
          group_id: moderation.status === "approved" && supabaseGroupId ? supabaseGroupId : null,
          session_token: doubt.session_token,
        })
        .select("id")
        .single();

      if (!doubtError && insertedDoubt?.id) {
        // Sync DB-generated doubt id back to in-memory
        memoryStore.doubts.delete(doubt.id);
        doubt.id = insertedDoubt.id;
        memoryStore.doubts.set(doubt.id, doubt);

          // Also record the submitter vote in Supabase for approved doubts
          // (triggers will increment vote_count from the votes table insert)
          if (moderation.status === "approved" && supabaseGroupId) {
            // upsert with ignoreDuplicates prevents duplicate-vote errors
            await adminClient.from("votes").upsert(
              {
                group_id: supabaseGroupId,
                session_token: input.sessionToken,
              },
              { ignoreDuplicates: true }
            );
            memoryStore.votes.add(`${supabaseGroupId}:${input.sessionToken}`);
          }
      } else if (doubtError) {
        handleSupabaseError(doubtError, "submitDoubt:insertDoubt");
      }
    } catch (e: unknown) {
      handleSupabaseError(e as { code?: string; message?: string }, "submitDoubt:remote");
    }
  }

  return { doubt, group: matchedGroup, status: moderation.status };
}

export async function getActiveGroupsForLecture(lectureId: string): Promise<DoubtGroup[]> {
  const serverClient = getSupabaseServerClient();
  if (serverClient) {
    try {
      const { data, error } = await serverClient
        .from("doubt_groups")
        .select("*")
        .eq("lecture_id", lectureId)
        .eq("status", "active")
        .gt("vote_count", 0)            // Only groups with at least one approved doubt
        .order("vote_count", { ascending: false });

      if (!error && data && data.length > 0) {
        return data as DoubtGroup[];
      }
    } catch {
      // Fallback
    }
  }

  const result: DoubtGroup[] = [];
  for (const group of memoryStore.groups.values()) {
    if (
      group.lecture_id === lectureId &&
      group.status === "active" &&
      group.vote_count > 0           // Only groups with at least one approved submission
    ) {
      result.push({ ...group });
    }
  }

  return result.sort((a, b) => b.vote_count - a.vote_count);
}

export async function getRankedGroupsForTeacher(lectureId: string): Promise<RankedGroup[]> {
  const groups = await getActiveGroupsForLecture(lectureId);

  // Score = (vote_count * 2) + total_submissions
  groups.sort((a, b) => {
    const scoreA = a.vote_count * 2 + a.total_submissions;
    const scoreB = b.vote_count * 2 + b.total_submissions;
    return scoreB - scoreA;
  });

  return groups.map((g, idx) => {
    const rank = idx < 3 ? idx + 1 : null;
    return {
      ...g,
      rank,
      is_top3: rank !== null,
      doubts: [],
    };
  });
}

export async function getApprovedDoubtsForStudent(lectureId: string, sessionToken: string) {
  const serverClient = getSupabaseServerClient();
  if (serverClient) {
    try {
      const { data, error } = await serverClient
        .from("doubts")
        .select("id, lecture_id, original_text, cleaned_text, moderation_status, group_id, submitted_at, session_token")
        .eq("lecture_id", lectureId)
        .eq("moderation_status", "approved")
        .order("submitted_at", { ascending: false });

      if (!error && data) {
        return data.map((d) => ({
          id: d.id,
          text: d.cleaned_text || d.original_text,
          groupId: d.group_id,
          submittedAt: d.submitted_at,
          isMySubmission: d.session_token === sessionToken,
        }));
      }
    } catch {
      // Fallback
    }
  }

  const list: Array<{
    id: string;
    text: string;
    groupId: string | null;
    submittedAt: string;
    isMySubmission: boolean;
  }> = [];

  for (const d of memoryStore.doubts.values()) {
    if (d.lecture_id === lectureId && d.moderation_status === "approved") {
      list.push({
        id: d.id,
        text: d.cleaned_text || d.original_text,
        groupId: d.group_id,
        submittedAt: d.submitted_at,
        isMySubmission: d.session_token === sessionToken,
      });
    }
  }

  return list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
}

// ─── 3. Atomic Voting ─────────────────────────────────────────────────────────

export async function toggleVote(input: {
  groupId: string;
  sessionToken: string;
}): Promise<{
  voted: boolean;
  voteCount: number;
}> {
  // ── Try Supabase first (post-migration path) ────────────────────────────
  // The toggle_vote RPC is atomic and handles duplicate-vote constraints at
  // the database level. We do NOT mutate in-memory state before we know
  // the Supabase result, otherwise a partial failure corrupts both stores.
  const adminClient = getSupabaseAdminClient();
  if (adminClient) {
    try {
      const { data, error } = await adminClient.rpc("toggle_vote", {
        p_group_id: input.groupId,
        p_session_token: input.sessionToken,
      });

      if (!error && data && data.ok) {
        // Sync the result back into the in-memory store for consistency
        const group = memoryStore.groups.get(input.groupId);
        if (group) {
          group.vote_count = data.vote_count;
        }
        const voteKey = `${input.groupId}:${input.sessionToken}`;
        if (data.voted) {
          memoryStore.votes.add(voteKey);
        } else {
          memoryStore.votes.delete(voteKey);
        }
        return { voted: data.voted, voteCount: data.vote_count };
      }
      // If error is PGRST125 or similar, fall through to in-memory
    } catch {
      // Network error — fall through to in-memory fallback
    }
  }

  // ── In-memory fallback (pre-migration / dev path) ────────────────────────
  const voteKey = `${input.groupId}:${input.sessionToken}`;
  const group = memoryStore.groups.get(input.groupId);
  let voted = false;
  let newVoteCount = group ? group.vote_count : 0;

  if (memoryStore.votes.has(voteKey)) {
    memoryStore.votes.delete(voteKey);
    if (group) {
      group.vote_count = Math.max(0, group.vote_count - 1);
      newVoteCount = group.vote_count;
    }
    voted = false;
  } else {
    memoryStore.votes.add(voteKey);
    if (group) {
      group.vote_count += 1;
      newVoteCount = group.vote_count;
    }
    voted = true;
  }

  return { voted, voteCount: newVoteCount };
}

export function hasSessionVoted(groupId: string, sessionToken: string): boolean {
  return memoryStore.votes.has(`${groupId}:${sessionToken}`);
}
