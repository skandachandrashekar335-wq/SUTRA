# SUTRA — Supabase Setup & Migration Guide

This guide covers everything needed to connect SUTRA to a real Supabase
backend so that lectures persist across devices and browser sessions.

---

## 1. Prerequisites

- A Supabase project (free tier is sufficient for development).
- Your project's URL, anon key, and service-role key from
  **Settings → API** in the Supabase dashboard.
- A `TEACHER_SESSION_SECRET` — generate with:
  ```
  openssl rand -base64 32
  ```

---

## 2. Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://<your-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<public anon key>
SUPABASE_SERVICE_ROLE_KEY=<secret service-role key — never expose to browser>
TEACHER_SESSION_SECRET=<32+ byte random secret>
```

**Security notes:**
- `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It must only appear in
  server-side API routes (`app/api/**`), never in client components.
- `.env.local` is in `.gitignore` — never commit it.

---

## 3. Determine migration state

Before running any migration, check whether the tables already exist.
Open **Supabase Dashboard → SQL Editor** and run:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

### Case A — No tables exist (fresh project)

Run both migrations in order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_secure_schema.sql`

### Case B — Migration 001 has been applied, 002 has not

Run only: `supabase/migrations/002_secure_schema.sql`

### Case C — Both already applied

No migration action needed. Verify by checking:

```sql
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'lecture_secrets'
) AS migration_002_applied;
```

---

## 4. Apply migrations

### Option A: Supabase Dashboard SQL Editor (recommended for first-time)

1. Open your project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Navigate to **SQL Editor**.
3. Click **New query**.
4. Paste the full contents of `001_initial_schema.sql`.
5. Click **Run**.
6. Repeat for `002_secure_schema.sql`.

### Option B: Supabase CLI (for teams and CI)

Install once:
```bash
npm install -g supabase
supabase login
```

Link to your project:
```bash
supabase link --project-ref <your-ref>
```

Push migrations:
```bash
supabase db push
```

---

## 5. Verify the schema

After running migrations, confirm all tables exist:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected tables:
- `lectures`
- `doubts`
- `doubt_groups`
- `votes`
- `lecture_secrets` (added by migration 002)

Verify RLS is enabled:

```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

All rows should have `rowsecurity = true`.

---

## 6. What migration 002 changes

Migration 002 (`002_secure_schema.sql`) hardens the schema produced by 001:

| Change | Why |
|--------|-----|
| Adds `lecture_secrets` table | Separates teacher token hash from the publicly readable `lectures` table |
| Replaces `read_live_lecture_by_code` policy | Prevents enumeration of all live lectures |
| Replaces `insert_doubt` policy with strict version | Prevents students from self-approving doubts or setting `group_id` |
| Adds `insert_vote_strict` policy | Ensures votes only target groups in live lectures |
| Adds trigger `trg_votes_count` | Maintains `vote_count` atomically on insert/delete |
| Adds trigger `trg_doubts_group_count` | Maintains `total_submissions` atomically |
| Adds `toggle_vote` RPC | Atomic vote toggle with duplicate prevention, exposed to `anon` role |
| Adds `get_live_lecture_by_code` RPC | Safe lecture lookup returning only public fields |

**Compatibility:** Migration 002 is additive — it adds a new table, drops
only the two permissive RLS policies that 001 defined, and replaces them
with stricter ones. It is safe to apply on top of a live 001 schema.
It does not delete any data.

---

## 7. Security audit notes

### What 001 left exposed

- `lectures` had a `teacher_token` column (plaintext hash) readable by any
  anon user who could list lectures. *(002 moves secrets to `lecture_secrets`
  with no public SELECT policy.)*
- `insert_doubt` policy used `WITH CHECK (true)`, allowing students to set
  `moderation_status = 'approved'` themselves.
- `insert_vote` policy used `WITH CHECK (true)`, allowing votes against any
  group including those in ended lectures.

### What 002 fixes

- Teacher credentials live in `lecture_secrets`, accessible only by the
  service role.
- Students can only insert doubts with `moderation_status = 'pending'`,
  `cleaned_text IS NULL`, and `group_id IS NULL`.
- Votes are only accepted for groups in currently live lectures.
- `vote_count` and `total_submissions` are maintained by database triggers,
  preventing race conditions from concurrent API calls.

### What remains application-enforced

- Moderation (approved / rejected / needs_review) — handled by the
  doubt engine in `lib/nlp/doubt-engine.ts` and enforced server-side
  in `app/api/doubts/route.ts`.
- Teacher authentication — HMAC-signed HTTP-only cookie validated by
  `lib/auth.ts` on every teacher operation.
- The teacher's join code is public by design; authorization is via
  the signed cookie, not the join code.

---

## 8. Testing persistence after migration

### Test 1: Create a lecture

```bash
curl -X POST http://localhost:3000/api/lectures \
  -H "Content-Type: application/json" \
  -d '{"title":"Test Lecture","subject":"Mathematics"}'
```

Expected: `{"ok":true,"data":{"id":"...","join_code":"..."}}`

### Test 2: Join the lecture

```bash
curl -X POST http://localhost:3000/api/lectures/join \
  -H "Content-Type: application/json" \
  -d '{"join_code":"<CODE>"}'
```

Expected: `{"ok":true,"data":{"id":"...","title":"..."}}`

### Test 3: Submit a doubt

```bash
curl -X POST http://localhost:3000/api/doubts \
  -H "Content-Type: application/json" \
  -d '{"lecture_id":"<ID>","text":"What is the formula for standard deviation?","session_token":"test-session-123"}'
```

Expected: `{"ok":true,"data":{"moderationStatus":"approved",...}}`

### Test 4: Verify cross-device

Open `http://localhost:3000/join/<CODE>` in a different browser profile
(or incognito). The same lecture should load. After submitting a doubt,
open the teacher dashboard and confirm it appears there.

---

## 9. Environment variable checklist

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_APP_URL` | Yes | Base URL for QR codes and join links |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Project REST URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Safe for browser use |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only. Never expose to client |
| `TEACHER_SESSION_SECRET` | Yes | 32+ bytes. Used to sign teacher cookies |

---

## 10. Known limitations

- **Rate limiting**: No rate limiting is currently applied at the application
  layer. Supabase's built-in rate limiter applies to the anon key (100 reqs/s
  per IP by default). For production, add middleware-level rate limiting.
- **Session expiry**: Teacher sessions expire after 7 days. There is no
  refresh mechanism — the teacher must re-create the lecture or re-authenticate
  manually.
- **Moderation**: The current doubt engine uses a deterministic word-list
  approach. It does not use an AI model or a paid moderation API.
  It reliably blocks explicit profanity and flags ambiguous content for
  review; it does not detect every form of abuse.
- **NLP grouping**: Semantic grouping uses token overlap and synonym maps.
  It correctly handles common statistical term equivalence (mean/average)
  but will miss domain-specific synonyms not in its dictionary.
- **Realtime**: The student feed and teacher dashboard currently use polling
  (4-second intervals). Supabase Realtime can replace polling once migrations
  are applied and `ENABLE_REALTIME=true` is added to env (future enhancement).
