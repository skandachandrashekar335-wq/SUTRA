import { z } from "zod";
import { JOIN_CODE_LENGTH, MAX_DOUBT_LENGTH, MIN_DOUBT_LENGTH } from "./types";

// ─── Lecture Validation ────────────────────────────────────────────────────────

export const createLectureSchema = z.object({
  title: z
    .string()
    .min(3, "Lecture title must be at least 3 characters")
    .max(120, "Lecture title must be under 120 characters")
    .trim(),
  subject: z
    .string()
    .min(2, "Subject must be at least 2 characters")
    .max(80, "Subject must be under 80 characters")
    .trim(),
  section: z
    .string()
    .max(40, "Section label must be under 40 characters")
    .trim()
    .optional()
    .or(z.literal("")),
});

export type CreateLectureData = z.infer<typeof createLectureSchema>;

// ─── Join Lecture Validation ───────────────────────────────────────────────────

export const joinLectureSchema = z.object({
  join_code: z
    .string()
    .length(
      JOIN_CODE_LENGTH,
      `Code must be exactly ${JOIN_CODE_LENGTH} characters`
    )
    .regex(
      /^[A-Z0-9]+$/,
      "Code must contain only uppercase letters and digits"
    ),
});

export type JoinLectureData = z.infer<typeof joinLectureSchema>;

// ─── Doubt Submission Validation ───────────────────────────────────────────────

export const submitDoubtSchema = z.object({
  text: z
    .string()
    .min(MIN_DOUBT_LENGTH, `Question must be at least ${MIN_DOUBT_LENGTH} characters`)
    .max(MAX_DOUBT_LENGTH, `Question must be under ${MAX_DOUBT_LENGTH} characters`)
    .trim()
    .refine(
      (v) => v.split(" ").filter(Boolean).length >= 3,
      "Please write a more complete question (at least 3 words)"
    ),
  lecture_id: z.string().min(1, "Invalid lecture ID"),
  session_token: z.string().min(1, "Session token required"),
});

export type SubmitDoubtData = z.infer<typeof submitDoubtSchema>;

// ─── Vote Validation ───────────────────────────────────────────────────────────

export const voteSchema = z.object({
  group_id: z.string().min(1, "Invalid group ID"),
  session_token: z.string().min(1, "Session token required"),
});

export type VoteData = z.infer<typeof voteSchema>;
