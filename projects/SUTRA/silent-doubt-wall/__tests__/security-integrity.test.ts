/**
 * SUTRA — Security & Data Integrity Tests
 *
 * Covers:
 * - Public API never contains teacher secrets
 * - Lecture cross-contamination guard
 * - Vote integrity: duplicate prevention, unvote, count accuracy
 * - Ended-lecture submission and vote rejection
 * - Group count consistency
 * - Grouping: correct merges and correct separations
 * - Original text preservation
 * - Join-code uniqueness and format
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createLecture,
  submitDoubt,
  getActiveGroupsForLecture,
  getApprovedDoubtsForStudent,
  getRankedGroupsForTeacher,
  toggleVote,
  hasSessionVoted,
  endLecture,
  getLectureById,
  getLiveLectureByCode,
} from "../lib/services/doubt-service";
import { hashTeacherSecret } from "../lib/auth";

// ─── Section 1: Teacher secret isolation ──────────────────────────────────────

describe("createLecture — teacher secret security", () => {
  it("teacherSecret is different from the stored hash", async () => {
    const { lecture, teacherSecret } = await createLecture({
      title: "Security Test Lecture",
      subject: "Cryptography",
    });

    const expectedHash = hashTeacherSecret(teacherSecret);
    // teacher_id should be the SHA-256 hash
    expect(lecture.teacher_id).toBe(expectedHash);
    expect(lecture.teacher_id).not.toBe(teacherSecret);
  });

  it("lecture object returned to API contains no raw secret", async () => {
    const { lecture, teacherSecret } = await createLecture({
      title: "Secrets Test",
      subject: "Security",
    });
    const serialized = JSON.stringify(lecture);
    expect(serialized).not.toContain(teacherSecret);
    // The raw secret is 64 hex chars; the hash is also 64 hex chars but different
    // Ensure they differ
    expect(lecture.teacher_id.length).toBe(64);
    expect(lecture.teacher_id).not.toBe(teacherSecret);
  });

  it("two lectures get independent teacher secrets", async () => {
    const a = await createLecture({ title: "L1", subject: "Math" });
    const b = await createLecture({ title: "L2", subject: "Math" });
    expect(a.teacherSecret).not.toBe(b.teacherSecret);
    expect(a.lecture.teacher_id).not.toBe(b.lecture.teacher_id);
  });
});

// ─── Section 2: Join-code format and uniqueness ────────────────────────────────

describe("createLecture — join code", () => {
  it("join code is 6 characters", async () => {
    const { lecture } = await createLecture({ title: "Code Test", subject: "X" });
    expect(lecture.join_code).toHaveLength(6);
  });

  it("join code contains only uppercase letters and digits", async () => {
    const { lecture } = await createLecture({ title: "Code Format", subject: "X" });
    expect(lecture.join_code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("join code does not contain ambiguous characters O, I, 0, 1", async () => {
    // Run 20 times to reduce false-negative probability
    for (let i = 0; i < 20; i++) {
      const { lecture } = await createLecture({ title: `Amb ${i}`, subject: "X" });
      expect(lecture.join_code).not.toMatch(/[OI01]/);
    }
  });

  it("getLiveLectureByCode returns the created lecture", async () => {
    const { lecture } = await createLecture({ title: "Lookup Test", subject: "Y" });
    const found = await getLiveLectureByCode(lecture.join_code);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(lecture.id);
  });

  it("getLiveLectureByCode returns null for unknown codes", async () => {
    const found = await getLiveLectureByCode("ZZZZZ9");
    expect(found).toBeNull();
  });

  it("getLiveLectureByCode is case-insensitive", async () => {
    const { lecture } = await createLecture({ title: "Case Test", subject: "Z" });
    const found = await getLiveLectureByCode(lecture.join_code.toLowerCase());
    expect(found?.id).toBe(lecture.id);
  });
});

// ─── Section 3: Cross-lecture data isolation ──────────────────────────────────

describe("cross-lecture isolation", () => {
  it("doubts from lecture A do not appear in lecture B", async () => {
    const { lecture: a } = await createLecture({ title: "Lecture A", subject: "Physics" });
    const { lecture: b } = await createLecture({ title: "Lecture B", subject: "Chemistry" });

    await submitDoubt({ lectureId: a.id, rawText: "What is Newton's first law?", sessionToken: "sa1" });

    const bDoubts = await getApprovedDoubtsForStudent(b.id, "sb1");
    const bGroups = await getActiveGroupsForLecture(b.id);

    expect(bDoubts.length).toBe(0);
    expect(bGroups.length).toBe(0);
  });

  it("vote on group in lecture A does not affect lecture B group counts", async () => {
    const { lecture: a } = await createLecture({ title: "Vote Isolation A", subject: "Math" });
    const { lecture: b } = await createLecture({ title: "Vote Isolation B", subject: "Math" });

    const { group: ga } = await submitDoubt({ lectureId: a.id, rawText: "What is the mean formula?", sessionToken: "u1" });
    const { group: gb } = await submitDoubt({ lectureId: b.id, rawText: "What is the mean formula?", sessionToken: "u2" });

    await toggleVote({ groupId: ga.id, sessionToken: "voter1" });

    const groupsA = await getActiveGroupsForLecture(a.id);
    const groupsB = await getActiveGroupsForLecture(b.id);

    // A's count went up; B's is still the original seeded count
    expect(groupsA[0].vote_count).toBeGreaterThan(gb.vote_count);
    // B's count should not have changed
    const bGroup = groupsB.find(g => g.id === gb.id);
    expect(bGroup?.vote_count).toBe(gb.vote_count);
  });
});

// ─── Section 4: Vote integrity ────────────────────────────────────────────────

describe("voting — count integrity", () => {
  let lectureId: string;
  let groupId: string;

  beforeEach(async () => {
    const { lecture } = await createLecture({ title: "Vote Test", subject: "Stats" });
    lectureId = lecture.id;
    const { group } = await submitDoubt({
      lectureId,
      rawText: "Why do we use n minus one in sample variance?",
      sessionToken: "seed-session",
    });
    groupId = group.id;
  });

  it("initial vote count after first approved submission is 1", async () => {
    const groups = await getActiveGroupsForLecture(lectureId);
    expect(groups[0].vote_count).toBe(1);
  });

  it("adding a vote from a new session increments count", async () => {
    const { voteCount } = await toggleVote({ groupId, sessionToken: "new-voter" });
    expect(voteCount).toBe(2);
  });

  it("unvoting decrements count, never below 0", async () => {
    await toggleVote({ groupId, sessionToken: "unvoter" }); // add
    const { voteCount } = await toggleVote({ groupId, sessionToken: "unvoter" }); // remove
    expect(voteCount).toBe(1); // back to seed count
  });

  it("same session voting twice: second call is a removal", async () => {
    const first = await toggleVote({ groupId, sessionToken: "double-voter" });
    const second = await toggleVote({ groupId, sessionToken: "double-voter" });
    expect(first.voted).toBe(true);
    expect(second.voted).toBe(false);
    expect(second.voteCount).toBe(first.voteCount - 1);
  });

  it("multiple distinct sessions all increase count independently", async () => {
    const sessions = ["s1", "s2", "s3", "s4"];
    let lastCount = 1;
    for (const s of sessions) {
      const { voteCount } = await toggleVote({ groupId, sessionToken: s });
      expect(voteCount).toBe(lastCount + 1);
      lastCount = voteCount;
    }
  });

  it("hasSessionVoted tracks state correctly across toggle", async () => {
    expect(hasSessionVoted(groupId, "toggle-tracker")).toBe(false);
    await toggleVote({ groupId, sessionToken: "toggle-tracker" });
    expect(hasSessionVoted(groupId, "toggle-tracker")).toBe(true);
    await toggleVote({ groupId, sessionToken: "toggle-tracker" });
    expect(hasSessionVoted(groupId, "toggle-tracker")).toBe(false);
  });
});

// ─── Section 5: Ended lecture guards ──────────────────────────────────────────

describe("ended lecture — rejection guards", () => {
  it("endLecture changes status to ended", async () => {
    const { lecture } = await createLecture({ title: "To End", subject: "History" });
    const result = await endLecture(lecture.id);
    expect(result).toBe(true);
    const updated = await getLectureById(lecture.id);
    expect(updated?.status).toBe("ended");
  });

  it("submitDoubt throws on ended lecture", async () => {
    const { lecture } = await createLecture({ title: "Ended", subject: "Art" });
    await endLecture(lecture.id);
    await expect(
      submitDoubt({ lectureId: lecture.id, rawText: "Can I still ask?", sessionToken: "late" })
    ).rejects.toThrow("Lecture is not active or has ended.");
  });

  it("getLiveLectureByCode does not return ended lecture", async () => {
    const { lecture } = await createLecture({ title: "Ended Join", subject: "PE" });
    const code = lecture.join_code;
    await endLecture(lecture.id);
    const found = await getLiveLectureByCode(code);
    expect(found).toBeNull();
  });
});

// ─── Section 6: Group count consistency ───────────────────────────────────────

describe("group count consistency", () => {
  it("each new approved doubt in a unique group gives vote_count=1, total_submissions=1", async () => {
    const { lecture } = await createLecture({ title: "Count Test", subject: "Stats" });
    await submitDoubt({ lectureId: lecture.id, rawText: "What is median?", sessionToken: "u1" });
    const groups = await getActiveGroupsForLecture(lecture.id);
    expect(groups[0].vote_count).toBe(1);
    expect(groups[0].total_submissions).toBe(1);
  });

  it("a second approved doubt that matches an existing group increments both counts", async () => {
    const { lecture } = await createLecture({ title: "Match Count", subject: "Stats" });
    await submitDoubt({ lectureId: lecture.id, rawText: "What is the mean formula?", sessionToken: "u1" });
    await submitDoubt({ lectureId: lecture.id, rawText: "How do we calculate average?", sessionToken: "u2" });
    const groups = await getActiveGroupsForLecture(lecture.id);
    expect(groups[0].total_submissions).toBe(2);
    expect(groups[0].vote_count).toBe(2);
  });

  it("a needs_review doubt does NOT increment group counts", async () => {
    const { lecture } = await createLecture({ title: "Review No Count", subject: "Stats" });
    // approved first to create a group
    await submitDoubt({ lectureId: lecture.id, rawText: "What is standard deviation?", sessionToken: "u1" });
    const before = (await getActiveGroupsForLecture(lecture.id))[0].vote_count;

    await submitDoubt({ lectureId: lecture.id, rawText: "This is stupid I hate stats", sessionToken: "u2" });
    const after = (await getActiveGroupsForLecture(lecture.id))[0].vote_count;

    expect(after).toBe(before);
  });

  it("rejected doubts do not create groups", async () => {
    const { lecture } = await createLecture({ title: "Rejected No Group", subject: "CS" });
    await submitDoubt({ lectureId: lecture.id, rawText: "What the fuck is this", sessionToken: "u1" });
    const groups = await getActiveGroupsForLecture(lecture.id);
    expect(groups.length).toBe(0);
  });
});

// ─── Section 7: Grouping logic ────────────────────────────────────────────────

describe("semantic grouping — separation guarantees", () => {
  it("mean and mode questions remain in separate groups", async () => {
    const { lecture } = await createLecture({ title: "Group Sep", subject: "Stats" });
    await submitDoubt({ lectureId: lecture.id, rawText: "What is the formula for mean?", sessionToken: "a" });
    await submitDoubt({ lectureId: lecture.id, rawText: "What is the formula for mode?", sessionToken: "b" });
    const groups = await getActiveGroupsForLecture(lecture.id);
    expect(groups.length).toBe(2);
  });

  it("mean and average questions are grouped together", async () => {
    const { lecture } = await createLecture({ title: "Group Merge", subject: "Stats" });
    await submitDoubt({ lectureId: lecture.id, rawText: "What is the formula for mean?", sessionToken: "a" });
    await submitDoubt({ lectureId: lecture.id, rawText: "How do we calculate average?", sessionToken: "b" });
    const groups = await getActiveGroupsForLecture(lecture.id);
    expect(groups.length).toBe(1);
    expect(groups[0].total_submissions).toBe(2);
  });

  it("median and mean questions remain separate", async () => {
    const { lecture } = await createLecture({ title: "Med vs Mean", subject: "Stats" });
    await submitDoubt({ lectureId: lecture.id, rawText: "Why is the median unaffected by outliers?", sessionToken: "a" });
    await submitDoubt({ lectureId: lecture.id, rawText: "What is the formula for mean?", sessionToken: "b" });
    const groups = await getActiveGroupsForLecture(lecture.id);
    expect(groups.length).toBe(2);
  });

  it("original question text is preserved in the doubt record", async () => {
    const { lecture } = await createLecture({ title: "Text Preserve", subject: "Math" });
    const rawText = "What is the formla for mean?"; // intentional typo
    const { doubt } = await submitDoubt({ lectureId: lecture.id, rawText, sessionToken: "x" });
    expect(doubt.original_text).toBe(rawText);
    // cleaned_text should have the typo corrected
    expect(doubt.cleaned_text?.toLowerCase()).toContain("formula");
  });
});

// ─── Section 8: Ranked groups ─────────────────────────────────────────────────

describe("getRankedGroupsForTeacher", () => {
  it("returns top 3 marked as is_top3, rest are not", async () => {
    const { lecture } = await createLecture({ title: "Ranking Test", subject: "Stats" });
    const questions = [
      "What is the formula for mean?",
      "What is the formula for mode?",
      "What is the formula for median?",
      "What is standard deviation?",
    ];
    for (const q of questions) {
      await submitDoubt({ lectureId: lecture.id, rawText: q, sessionToken: Math.random().toString() });
    }
    const ranked = await getRankedGroupsForTeacher(lecture.id);
    const top3 = ranked.filter(g => g.is_top3);
    const others = ranked.filter(g => !g.is_top3);
    expect(top3.length).toBeLessThanOrEqual(3);
    expect(others.every(g => g.rank === null)).toBe(true);
  });

  it("group with more votes ranks higher", async () => {
    const { lecture } = await createLecture({ title: "Rank Order", subject: "Stats" });
    // Submit A with 1 voter, B with 3 voters
    const { group: ga } = await submitDoubt({ lectureId: lecture.id, rawText: "What is mean?", sessionToken: "base-a" });
    const { group: gb } = await submitDoubt({ lectureId: lecture.id, rawText: "What is mode?", sessionToken: "base-b" });
    await toggleVote({ groupId: gb.id, sessionToken: "extra1" });
    await toggleVote({ groupId: gb.id, sessionToken: "extra2" });

    const ranked = await getRankedGroupsForTeacher(lecture.id);
    // B should rank 1 (3 votes), A should rank 2 (1 vote)
    expect(ranked[0].id).toBe(gb.id);
    expect(ranked[1].id).toBe(ga.id);
  });
});
