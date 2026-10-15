# SUTRA — Anonymous Classroom Intelligence

> Every silent doubt deserves to be heard.

SUTRA is an anonymous classroom doubt-intelligence platform. Students submit questions without fear of embarrassment. Teachers see their class's real confusion points, grouped and ranked in real time.

---

## Architecture Overview

```
Next.js App Router (TypeScript)
├── app/
│   ├── page.tsx               — Landing page
│   ├── teacher/new            — Create a lecture
│   ├── teacher/[id]/dashboard — Teacher dashboard + projector mode
│   ├── join/[code]            — Student join flow
│   ├── lecture/[id]           — Student feed
│   └── api/
│       ├── lectures/          — Create, fetch, join, end lectures
│       ├── doubts/            — Submit, moderate, group doubts
│       ├── votes/             — "Me too" voting
│       ├── ai/refine          — AI question refinement
│       ├── ai/answer          — RAG grounded answers
│       ├── ai/insights/[id]   — Teacher AI insights
│       ├── ai/documents/[id]  — Document upload + listing
│       └── system/health      — Health check + diagnostics
├── lib/
│   ├── ai/
│   │   ├── provider.ts        — Gemini + OpenRouter adapter
│   │   ├── refiner.ts         — Question refinement service
│   │   ├── insights.ts        — Teacher summarization
│   │   ├── rag-answer.ts      — Evidence-grounded answers
│   │   ├── document-extractor.ts — PDF/DOCX/PPTX/TXT extraction
│   │   └── document-service.ts   — Upload, chunk, retrieve
│   ├── nlp/doubt-engine.ts    — Local deterministic NLP (moderation, grouping)
│   ├── services/doubt-service.ts — Core business logic + Supabase integration
│   ├── auth.ts                — HMAC teacher session cookies
│   ├── env.ts                 — Environment validation
│   ├── types.ts               — Shared TypeScript types
│   └── validation.ts          — Zod schemas
└── supabase/migrations/
    ├── 001_initial_schema.sql — Core tables
    ├── 002_secure_schema.sql  — RLS hardening + triggers
    └── 003_ai_features.sql    — AI tables (documents, chunks, answers)
```

**Persistence:** Supabase PostgreSQL (required for cross-device use). Falls back to in-process memory during development before migrations are applied — not suitable for production.

**AI:** Google Gemini (primary, free tier) + OpenRouter (fallback, free models). Both are optional — the classroom workflow runs without them.

---

## Required Environment Variables

Copy `.env.example` to `.env.local` and fill in:

### Infrastructure (required)

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API (keep secret) |
| `TEACHER_SESSION_SECRET` | `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` for dev; your domain in production |

### AI (optional — app works without these)

| Variable | Where to get it |
|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) — free tier |
| `GEMINI_MODEL` | `gemini-1.5-flash` (default) |
| `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) — free models available |
| `OPENROUTER_MODEL` | `mistralai/mistral-7b-instruct:free` (default) |
| `SUTRA_SCHEDULER_SECRET` | `openssl rand -base64 32` — protects `/api/system/health?secret=...` |

**Never** put `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, or `TEACHER_SESSION_SECRET` in a `NEXT_PUBLIC_*` variable.

---

## Database Setup (required for cross-device persistence)

The app runs in-process memory until you apply these migrations. Data is lost on server restart without them.

1. Open your [Supabase SQL Editor](https://supabase.com/dashboard)
2. Run `supabase/migrations/001_initial_schema.sql`
3. Run `supabase/migrations/002_secure_schema.sql`
4. Run `supabase/migrations/003_ai_features.sql` (if using AI features)
5. Verify:
   ```sql
   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
   -- Should return: lectures, doubts, doubt_groups, votes, lecture_secrets,
   --               lecture_documents, document_chunks, ai_answers, ai_usage_events
   ```

### Private Storage bucket (for document uploads)

In Supabase SQL Editor:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('lecture-documents', 'lecture-documents', false)
ON CONFLICT (id) DO NOTHING;
```

---

## Local Development

```bash
git clone https://github.com/skandachandrashekhar335-wq/SUTRA.git
cd SUTRA/silent-doubt-wall
npm install
cp .env.example .env.local
# Fill in .env.local with your credentials
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Testing

```bash
npm test           # 108 tests across 4 suites
npm run lint       # ESLint (0 errors target)
npx tsc --noEmit   # TypeScript strict check
npm run build      # Production build (17 routes)
```

Tests mock all AI and Supabase calls — no API credits consumed, no network required.

---

## Smoke Test (manual, after applying migrations)

### Teacher flow
1. Visit `/teacher/new` → create a lecture
2. Note the join code and QR code
3. The teacher dashboard opens at `/teacher/[id]/dashboard`

### Student flow (separate browser / incognito)
1. Visit `/join` → enter the join code, or scan the QR
2. Submit a question
3. Verify it appears in the teacher dashboard
4. Submit the same question from a third browser → it should merge into the same group
5. Click "Me too" → vote count increments
6. Clicking "Me too" again should decrement (toggle)

### Cross-device verification
- Create a lecture on one device, join from another device on a different network
- Both must see the same data (requires migrations applied)

### AI features (requires API key)
1. Submit a question → click "Suggest improvement" → AI suggestion appears
2. Upload a PDF to the teacher dashboard → submit a related question → AI answer with citation appears

---

## AI Provider Details

| Feature | Requires |
|---|---|
| Question refinement | `GEMINI_API_KEY` or `OPENROUTER_API_KEY` |
| Teacher insights | Same |
| RAG grounded answers | Same + document uploaded |
| Document upload/extraction | No AI key needed (extraction is local) |

Without an AI key: question refinement returns the local spell-corrected version. Insights show stats only. RAG answers return "not available".

### Free tier limits (as of Oct 2026)
- Gemini 1.5 Flash: 15 req/min, 1M tokens/day (free)
- OpenRouter free models: vary by model; `mistral-7b-instruct:free` has rate limits

SUTRA has bounded retries (1 retry, 1.5s backoff) and a 20s request timeout. Rate-limit errors fall back to the secondary provider before failing gracefully.

---

## Supported Document Formats

| Format | Text extraction | Page/slide refs |
|---|---|---|
| PDF | ✅ (text-layer PDFs) | ✅ page numbers |
| DOCX | ✅ | paragraph numbers |
| PPTX | ✅ | ✅ slide numbers |
| TXT | ✅ | section numbers |
| Scanned PDFs | ❌ (image-only — OCR not implemented) | — |

Max file size: **10 MB**.

---

## Security Notes

- Teacher sessions: HMAC-SHA256 signed HTTP-only cookies, lecture-bound, 7-day expiry
- Teacher secrets: stored as SHA-256 hash only (`lecture_secrets` table, no public RLS policies)
- Student submissions: validated server-side, moderated independently of client
- Document storage: private Supabase bucket, service-role only
- AI prompts: document content is sanitized to prevent prompt injection
- No PII stored: students identified only by ephemeral session tokens
- Service-role key: server-side only, never in client bundles or `NEXT_PUBLIC_*` vars

---

## Known Limitations

- No request-level rate limiting (Supabase-level RLS + Vercel/platform limits apply)
- Teacher sessions don't refresh — expire after 7 days (re-auth required)
- Moderation uses deterministic word-list rules, not an AI model
- NLP grouping uses token overlap + synonym maps (no embeddings)
- Scanned PDFs require OCR (not implemented)
- Supabase Realtime not wired — polling at 4s intervals instead
- Cross-device persistence requires manual migration apply

---

## Deployment

The app deploys to Vercel with zero config. Set all production env vars in the Vercel dashboard under Project → Settings → Environment Variables.

Set `NEXT_PUBLIC_APP_URL` to your production domain (used for QR code URLs).

---

## License

MIT
