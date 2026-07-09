# Memento — DevOps Sprint: 2-Week Production Readiness Plan

> **Assigned to:** DevOps Engineer
> **Goal:** Take Memento from a developer demo to a closed-beta deployment that is secure, stable, and ready for real paying users.
> **Deadline:** End of Day 14
> **Reference docs:** `ARCHITECTURE_SUSTAINABILITY.md`, `DEPLOYMENT_READINESS.md`

---

## Context: What you're working with

Memento is a React/Vite SPA backed by Supabase (Postgres + pgvector + Storage + Auth). Right now **every AI operation runs in the user's browser** — API keys are baked into the JS bundle, there is no backend worker, no job queue, and no payment or credit system. Your job is to fix that in two weeks.

The app generates: handbooks, reports, audio podcasts, video overviews, quizzes, flashcards, and mindmaps — all from uploaded PDFs. Each of these needs to move behind a server before real users touch it.

---

## Week 1 — Security, Infrastructure, and Core Backend

### Day 1 — Secrets rotation and lockdown

**Priority: P0. Do this before anything else.**

- [ ] Rotate every API key: OpenAI, OpenRouter, FAL, NVIDIA. Treat all existing keys as compromised.
- [ ] Remove the Docker image from public Docker Hub. Make it private or move to a private registry.
- [ ] Audit `vite.config.ts` and all `.env*` files. Every `VITE_OPENAI_*`, `VITE_OPENROUTER_*`, `VITE_FAL_*`, `VITE_NVIDIA_*` key must be removed from the browser build. These are readable by anyone who opens DevTools.
- [ ] Patch the `password_reset_codes` Supabase RPC — it currently allows unauthenticated calls. Add `auth.uid() IS NOT NULL` check or require a signed token.
- [ ] Confirm no secrets are committed to git history. Run `git log -p | grep -i "sk-"` and similar. If found, rotate again and rewrite history.

**Done when:** `npm run build` produces a bundle with zero AI provider keys. Docker image is private.

---

### Day 2 — Fix the NVIDIA embeddings URL and consolidate schema

The single fastest way to discover the app is broken in production: `lib/nvidiaEmbeddings.ts` hardcodes `http://localhost:5173/nvidia-api/v1`. Every PDF upload in prod silently fails.

- [ ] Create `supabase/functions/embed/index.ts` — a Deno Edge Function that accepts `{ text: string[] }`, calls the NVIDIA BGE-M3 API using a server-side `NVIDIA_API_KEY` env var, and returns embeddings.
- [ ] Update `lib/nvidiaEmbeddings.ts` to call `supabase.functions.invoke('embed', ...)` instead of the localhost proxy.
- [ ] Create `supabase/migrations/` directory. Consolidate the four conflicting SQL files into ordered migrations:
  ```
  0001_initial_schema.sql       ← from setup-database.sql
  0002_lightrag_1024_dim.sql    ← from migrate-to-1024-dimensions.sql
  0003_lightrag_functions.sql   ← from lightrag-functions.sql, updated to vector(1024)
  ```
- [ ] Resolve the dimension mismatch: `match_document_chunks` must use `vector(1024)` everywhere. Delete `supabase/schema_safe.sql` and `supabase/setup-database.sql` once migrations are canonical.
- [ ] Apply migrations to the production Supabase project. Verify `supabase db lint` passes.

**Done when:** Uploading a PDF in production creates embeddings without errors.

---

### Day 3–4 — Worker service scaffold and job queue

This is the foundation everything else builds on.

- [ ] Create `worker/` directory at repo root. Scaffold a Node.js service:
  ```
  worker/
    Dockerfile
    package.json
    src/
      index.ts          ← poll loop: SELECT FOR UPDATE SKIP LOCKED
      jobs/
        dispatcher.ts   ← routes job.type to the right generator
      generators/       ← empty for now, filled days 5–9
      lib/
        supabase.ts     ← service-role Supabase client
        models.ts       ← model router (see Day 11)
  ```
- [ ] Add migration `0004_jobs_queue.sql`:
  ```sql
  CREATE TYPE job_status AS ENUM ('queued','running','completed','failed','dead');
  CREATE TABLE jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    type text NOT NULL,
    input_jsonb jsonb NOT NULL,
    status job_status NOT NULL DEFAULT 'queued',
    phase text,
    progress_pct int DEFAULT 0,
    attempts int DEFAULT 0,
    last_error text,
    cost_usd numeric(10,6) DEFAULT 0,
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz DEFAULT now()
  );
  CREATE INDEX ON jobs(status, created_at) WHERE status = 'queued';
  ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "users see own jobs" ON jobs FOR ALL USING (user_id = auth.uid());

  CREATE TABLE job_phases (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
    phase text NOT NULL,
    output_jsonb jsonb,
    storage_path text,
    completed_at timestamptz DEFAULT now(),
    UNIQUE(job_id, phase)
  );
  ```
- [ ] Create `supabase/functions/create-job/index.ts` — validates request, checks user quota (see Day 10), inserts a `jobs` row, returns `{ jobId }`.
- [ ] Update the browser: replace direct generator calls with `supabase.functions.invoke('create-job', ...)` + Supabase Realtime subscription on `jobs` where `id = jobId`. Start with handbook as the proof-of-concept.
- [ ] Deploy the worker to Fly.io or Railway. It should start polling the `jobs` table immediately (even if no generators are wired yet).

**Done when:** Creating a handbook job from the browser inserts a row in `jobs` and the worker picks it up (even if it just marks it `completed` with a stub for now).

---

### Day 5 — Move chat and embeddings server-side

- [ ] Create `supabase/functions/chat/index.ts` — accepts `{ notebookId, message, history }`, runs LightRAG retrieval + OpenRouter streaming completion server-side, streams the response back. The browser's `lib/aiChat.ts` becomes a thin wrapper around `supabase.functions.invoke('chat', ...)`.
- [ ] Move `lib/documentProcessor.ts` embedding calls into the `embed` Edge Function created on Day 2.
- [ ] Add `@sentry/react` to the browser app (`main.tsx`). Add `@sentry/node` to the worker. Both should report to the same Sentry project with `environment: 'production'`.
- [ ] Verify: open DevTools Network tab, generate a chat response — confirm no direct calls to `api.openai.com` or `openrouter.ai` from the browser.

**Done when:** Browser holds zero AI provider keys. All LLM traffic goes through Supabase Edge Functions or the worker.

---

### Day 6–7 — Audio worker with FFmpeg

The audio pipeline is the most broken part of the app. The current browser-side MP3 mixer produces malformed files that iOS Safari rejects.

- [ ] Add `ffmpeg` to the worker Dockerfile:
  ```dockerfile
  RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
  ```
- [ ] Port `lib/agents/audioMasterAgent.ts` to `worker/generators/audio.ts`. The worker owns the full pipeline: script generation → TTS → mix → upload.
- [ ] Replace `lib/agents/audioMixer.ts` concat logic with FFmpeg:
  ```ts
  // Write segment paths to a concat manifest, then:
  execFile('ffmpeg', ['-f','concat','-safe','0','-i','/tmp/concat.txt',
    '-af','loudnorm','-c:a','libmp3lame','-q:a','4','-f','mp3','pipe:1'],
    { encoding: 'buffer' }, callback);
  ```
- [ ] Fix the `TTSWorkerPoolAgent` ordering bug in `lib/agents/ttsWorkerPool.ts`:
  - Replace `results[results.findIndex(r => !r)] = processed` with `results[segment.originalIndex * 1000 + segment.splitIndex] = processed`
  - Use a `Map<number, ProcessedSegment>` to avoid sparse array collisions
- [ ] Replace `calculateAudioDuration` fixed-bitrate estimate with `ffprobe`:
  ```ts
  execFile('ffprobe',['-v','quiet','-print_format','json','-show_format', filePath],
    (err, stdout) => resolve(JSON.parse(stdout).format.duration * 1000));
  ```
- [ ] Implement real phase checkpointing: each TTS segment result writes to `job_phases` before the next segment starts. Delete the `localStorage` checkpoint code from `audioMasterAgent.ts`.
- [ ] End-to-end test: generate a 5-minute podcast. Download the MP3. Verify it plays on iOS Safari and in VLC. Verify duration metadata is accurate.

**Done when:** Audio generation runs entirely in the worker, produces valid MP3, and resumes correctly if the worker restarts mid-job.

---

## Week 2 — Generators, Payments, Quotas, and Launch

### Day 8 — Handbook and report workers + relational persistence

- [ ] Add migration `0005_relational_content.sql`:
  ```sql
  CREATE TABLE handbooks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notebook_id uuid REFERENCES notebooks(id) ON DELETE CASCADE, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, title text NOT NULL, word_count int, created_at timestamptz DEFAULT now());
  CREATE TABLE handbook_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), handbook_id uuid REFERENCES handbooks(id) ON DELETE CASCADE, level int NOT NULL, title text NOT NULL, content_markdown text NOT NULL, order_index int NOT NULL);
  CREATE TABLE reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notebook_id uuid REFERENCES notebooks(id) ON DELETE CASCADE, user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, title text NOT NULL, created_at timestamptz DEFAULT now());
  CREATE TABLE report_sections (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id uuid REFERENCES reports(id) ON DELETE CASCADE, level int NOT NULL, title text NOT NULL, content_markdown text NOT NULL, order_index int NOT NULL);
  ```
- [ ] Port `lib/handbookGenerator.ts` to `worker/generators/handbook.ts`. Update `saveHandbook()` to insert into `handbooks` + `handbook_sections` instead of writing a JSONB blob to `generated_assets.metadata`.
- [ ] Port `lib/reportGenerator.ts` to `worker/generators/report.ts`. Same relational pattern.
- [ ] Update `components/HandbookPlayback.tsx` and `components/ReportPlayback.tsx` to query the new tables instead of reading `metadata.handbookData`.

**Done when:** Generating a handbook writes relational rows. The playback component renders from those rows. The `generated_assets.metadata` blob is no longer used for handbooks or reports.

---

### Day 9 — Quiz, flashcard, mindmap workers + usage tracking

- [ ] Port `lib/quizGenerator.ts`, `lib/flashcardGenerator.ts`, `lib/mindmapGenerator.ts` to `worker/generators/`. These are fast (< 30 s, one LLM call each) — they can run as Edge Functions if preferred over the worker.
- [ ] Add migration `0006_usage_events.sql`:
  ```sql
  CREATE TABLE usage_events (id bigserial PRIMARY KEY, user_id uuid REFERENCES auth.users(id), job_id uuid REFERENCES jobs(id), provider text NOT NULL, model text NOT NULL, tokens_in int, tokens_out int, chars int, images int, cost_usd numeric(10,6) NOT NULL, created_at timestamptz DEFAULT now());
  CREATE INDEX ON usage_events(user_id, created_at);
  ```
- [ ] Wrap every LLM/TTS/image call in the worker with a `trackedCompletion()` helper that inserts a `usage_events` row and increments `jobs.cost_usd`.

**Done when:** Every AI call in the worker is logged to `usage_events`. Zero AI keys remain in the browser bundle.

---

### Day 10 — Payment plans and user credits

This is the monetisation foundation. Memento needs at least a free tier and one paid tier before onboarding users.

**Recommended stack:** Stripe for payments, Supabase for credit/quota tracking.

- [ ] Add migration `0007_plans_and_credits.sql`:
  ```sql
  CREATE TABLE plans (
    id text PRIMARY KEY,           -- 'free' | 'pro' | 'team'
    display_name text NOT NULL,
    price_monthly_usd numeric(8,2),
    credits_per_month int NOT NULL, -- generation credits, not dollars
    max_notebooks int,
    max_storage_gb numeric(6,2),
    features jsonb                  -- { "audio": true, "video": false, ... }
  );
  INSERT INTO plans VALUES
    ('free',  'Free',  0,     50,  3,   1.0,  '{"audio":false,"video":false,"pdf_export":false}'),
    ('pro',   'Pro',   19.00, 500, 20,  10.0, '{"audio":true,"video":true,"pdf_export":true}'),
    ('team',  'Team',  49.00, 2000,100, 50.0, '{"audio":true,"video":true,"pdf_export":true}');

  CREATE TABLE user_subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    plan_id text REFERENCES plans(id) DEFAULT 'free',
    stripe_customer_id text,
    stripe_subscription_id text,
    current_period_start timestamptz,
    current_period_end timestamptz,
    status text DEFAULT 'active',   -- 'active' | 'past_due' | 'canceled'
    created_at timestamptz DEFAULT now()
  );

  CREATE TABLE user_credits (
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    credits_remaining int NOT NULL DEFAULT 50,
    credits_used_this_period int NOT NULL DEFAULT 0,
    period_reset_at timestamptz NOT NULL DEFAULT (date_trunc('month', now()) + interval '1 month')
  );
  ```
- [ ] Set up Stripe: create Free, Pro ($19/mo), and Team ($49/mo) products and prices in the Stripe dashboard.
- [ ] Create `supabase/functions/stripe-webhook/index.ts` to handle:
  - `checkout.session.completed` → upsert `user_subscriptions`, reset `user_credits.credits_remaining` to plan limit
  - `invoice.payment_succeeded` → reset credits for the new billing period
  - `customer.subscription.deleted` → downgrade to free plan
- [ ] Create `supabase/functions/create-checkout/index.ts` — accepts `{ planId }`, creates a Stripe Checkout session, returns the URL. The browser redirects to it.
- [ ] Update `create-job` Edge Function to check `user_credits.credits_remaining > 0` before queuing. Deduct 1 credit per job on creation. Return `{ error: 'insufficient_credits' }` if exhausted.
- [ ] Add credit cost per job type (e.g. audio = 5 credits, handbook = 3 credits, quiz = 1 credit) to the `plans` features JSONB or a separate `job_credit_costs` table.
- [ ] Add a `pg_cron` job to reset credits monthly:
  ```sql
  SELECT cron.schedule('reset-credits', '0 0 1 * *', $$
    UPDATE user_credits SET credits_remaining = (
      SELECT p.credits_per_month FROM user_subscriptions us
      JOIN plans p ON p.id = us.plan_id WHERE us.user_id = user_credits.user_id
    ), credits_used_this_period = 0, period_reset_at = date_trunc('month', now()) + interval '1 month';
  $$);
  ```
- [ ] Add a `/settings/billing` page to the React app showing: current plan, credits used / remaining, upgrade button, billing portal link (Stripe Customer Portal).

**Done when:** A new user signs up on the Free plan with 50 credits. Generating a quiz costs 1 credit. Upgrading to Pro via Stripe resets credits to 500. The billing page shows accurate usage.

---

### Day 11 — Rate limiting, model router, and budget alerts

- [ ] Create `worker/lib/models.ts`:
  ```ts
  export const models = {
    chat:  { primary: 'x-ai/grok-4.1-fast',       fallback: 'openai/gpt-4o-mini',               costPer1kTokens: 0.005 },
    embed: { primary: 'nvidia/bge-m3',             fallback: 'openai/text-embedding-3-small',    costPer1kTokens: 0.00002 },
    tts:   { primary: 'openai/tts-1',              fallback: 'google/chirp-hd',                  costPerChar: 0.000015 },
    image: { primary: 'openai/gpt-image-1',        fallback: 'fal/flux.1-schnell',               costPerImage: 0.04 },
    graph: { primary: 'openai/gpt-4o-mini',        fallback: 'nvidia/nemotron-3-nano-30b-a3b:free', costPer1kTokens: 0.00015 },
  } as const;
  ```
- [ ] Grep-replace all ~40 hardcoded model strings across `worker/generators/` with `models.<capability>.primary`.
- [ ] Add global concurrency limiter in the worker: max 4 audio jobs running simultaneously across all users (not per user).
- [ ] Add budget alert: after each `usage_events` insert, call `monthly_spend_usd()`. If > 80% of the monthly OpenAI/OpenRouter budget, POST to a Slack webhook or PagerDuty.
  ```sql
  CREATE OR REPLACE FUNCTION monthly_spend_usd() RETURNS numeric AS $$
    SELECT COALESCE(SUM(cost_usd), 0) FROM usage_events
    WHERE created_at > date_trunc('month', now());
  $$ LANGUAGE sql STABLE;
  ```

**Done when:** Swapping a model is a one-line change in `models.ts`. Budget alerts fire in Slack when spend crosses the threshold.

---

### Day 12 — Storage lifecycle and slide cleanup

- [ ] Rename all worker storage writes to use path conventions:
  - `assets/drafts/<userId>/<jobId>/segment_N.mp3` for in-progress audio
  - `assets/final/<userId>/<assetId>/output.mp3` for completed jobs
- [ ] Add `pg_cron` nightly cleanup:
  ```sql
  SELECT cron.schedule('cleanup-drafts', '0 3 * * *', $$
    DELETE FROM storage.objects
    WHERE bucket_id = 'assets' AND name LIKE 'drafts/%'
      AND created_at < now() - interval '7 days';
  $$);
  ```
- [ ] Fix `lib/agents/videoMasterAgent.ts`: after `uploadSlideImage()` runs, delete `imageBase64` from the `Slide` object. The current code keeps both, doubling payload size.
- [ ] Add per-user storage quota check in `create-job`: query `storage.objects` size sum for the user, reject if over plan limit.

**Done when:** Draft files auto-delete after 7 days. No base64 image data is stored in the database.

---

### Day 13 — Migrations CI, RLS hardening, and smoke tests

- [ ] Add GitHub Actions workflow `.github/workflows/db-check.yml`:
  ```yaml
  on: [pull_request]
  jobs:
    db:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: supabase/setup-cli@v1
        - run: supabase db reset --db-url ${{ secrets.SUPABASE_TEST_DB_URL }}
        - run: supabase db push --db-url ${{ secrets.SUPABASE_TEST_DB_URL }}
        - run: supabase db lint
  ```
- [ ] Write RLS policy tests for the three most critical tables: `jobs`, `handbooks`, `user_credits`. Verify a user cannot read or modify another user's rows.
- [ ] Verify Stripe webhook signature validation is in place (reject requests without a valid `Stripe-Signature` header).
- [ ] Run a full smoke test: sign up → upload PDF → generate handbook (3 credits) → generate podcast (5 credits) → verify credit balance updated → upgrade to Pro → verify credits reset to 500.

**Done when:** CI passes on a clean DB. Smoke test passes end-to-end.

---

### Day 14 — Final hardening and launch cut

- [ ] Fix any regressions or blockers found during days 1–13.
- [ ] Confirm the production Supabase project has all 7 migrations applied cleanly.
- [ ] Confirm the worker is deployed and healthy (health endpoint returns 200).
- [ ] Confirm Stripe webhooks are pointed at the production Edge Function URL.
- [ ] Confirm Sentry is receiving events from both browser and worker.
- [ ] Set `MONTHLY_BUDGET_ALERT_USD` env var on the worker.
- [ ] Tag `v0.1.0-beta` on `main`.
- [ ] Onboard first closed-beta users.

---

## Environment variables checklist

### Supabase Edge Functions (set via `supabase secrets set`)
```
OPENROUTER_API_KEY
OPENAI_API_KEY
NVIDIA_API_KEY
FAL_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

### Worker service (set in Fly.io / Railway dashboard)
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENROUTER_API_KEY
OPENAI_API_KEY
NVIDIA_API_KEY
FAL_API_KEY
SENTRY_DSN
MONTHLY_BUDGET_ALERT_USD=500
SLACK_BUDGET_WEBHOOK_URL
MAX_CONCURRENT_AUDIO_JOBS=4
```

### Browser build (safe to expose — no secrets)
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SENTRY_DSN
VITE_STRIPE_PUBLISHABLE_KEY
VITE_GIT_SHA
```

---

## What is deferred (not blocking launch)

| Item | Why deferred | When to revisit |
|---|---|---|
| Real MP4 video export | In-browser DOM playback works for beta | Post-launch, when users request downloads |
| Server-side PDF via Puppeteer | jsPDF works for beta (CVE risk accepted) | Before public launch |
| HNSW index migration | ivfflat fine up to ~500 notebooks | When active notebooks cross 300 |
| Full OpenTelemetry tracing | Sentry covers the critical path | Post-launch |
| `/admin/jobs` dashboard | Supabase Studio covers ops needs for beta | When support volume grows |
| CDN / Cloudflare R2 migration | Supabase Storage works for beta | When egress costs become visible |

---

## Definition of done

The sprint is complete when all of the following are true:

1. Zero AI provider keys are present in the browser JS bundle.
2. A new user can sign up, upload a PDF, and generate a handbook without errors.
3. Audio generation produces a valid MP3 that plays on iOS Safari.
4. Stripe checkout works: Free → Pro upgrade resets credits correctly.
5. Generating content deducts credits; exhausted users see a clear upgrade prompt.
6. The worker restarts mid-job and resumes from the last committed phase.
7. CI applies all 7 migrations cleanly against a fresh Supabase project.
8. Sentry captures at least one event from both browser and worker in production.
