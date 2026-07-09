# Memento - PX Change Log and Fix Plans

> **Purpose:** Track priority changes that need code, Supabase, infrastructure, or operational work before production release.
>
> **Priority scale:** P0 blocks public deployment, P1 blocks external beta, P2 is hardening, P3 is follow-up improvement.
>
> **Status:** Draft

---

## P0-1. Rebuild Password Reset Behind Supabase Edge Functions

**Status:** Implemented on main Supabase project

**Area:** Auth, Supabase DB, Supabase Edge Functions, frontend

**Backup location:** `supabase/backups/`

**Backup files:**
- `supabase/backups/20260501000000_before_safe_password_reset.sql`
- `supabase/backups/20260501001000_snapshot_public_schema_before_password_reset.sql`

**Affected files:**
- `supabase/reset_password_function.sql`
- `supabase/password_reset_codes_table.sql`
- `supabase/functions/send-verification-code/index.ts`
- `components/auth/ResetPassword.tsx`
- `lib/email.ts`

### Issue

The current password-reset implementation allows unauthenticated account takeover.

`reset_user_password(TEXT, TEXT)` is defined as a `SECURITY DEFINER` function, directly updates `auth.users.encrypted_password`, and is granted to `anon` and `authenticated`. Since the Supabase anon key is public by design, any visitor can call:

```ts
supabase.rpc('reset_user_password', {
  user_email: 'victim@example.com',
  new_password: 'attacker-controlled-password',
})
```

The reset-code table also exposes OTPs to the browser. `password_reset_codes` has permissive RLS policies allowing anonymous and authenticated users to insert, select, and update all rows. The browser generates the OTP, writes it to Supabase, reads it back for verification, logs it to the console, and then calls the password-reset RPC.

This means the reset flow has no trustworthy server-side ownership boundary. The Edge Function currently named `send-verification-code` does not fix this because it accepts the code from the client.

### Impact

- Any unauthenticated visitor can reset any user's password if the RPC exists in the Supabase project.
- Any visitor can read live password-reset OTPs from `password_reset_codes`.
- The OTP can be brute-forced because there is no server-enforced attempt counter.
- Browser-side code generation and console logging leaks reset secrets.
- Verification and password update are split across client-controlled steps.

### Fix Plan

1. **Immediate DB hotfix**
   - Drop `reset_user_password(TEXT, TEXT)` from the Supabase project, or revoke all public access immediately.
   - Remove `anon` and `authenticated` access to `password_reset_codes`.
   - Confirm the production Supabase project no longer exposes the RPC through the public API.

   ```sql
   REVOKE EXECUTE ON FUNCTION reset_user_password(TEXT, TEXT) FROM anon, authenticated;
   DROP FUNCTION IF EXISTS reset_user_password(TEXT, TEXT);
   ```

2. **Replace reset-code table policies**
   - Drop the existing `Anyone can insert password reset codes`, `Anyone can read password reset codes`, and `Anyone can update password reset codes` policies.
   - Keep RLS enabled.
   - Do not create public read/write policies for reset codes.
   - Access the table only with the service-role key from Edge Functions or service-role-only SQL helpers.

3. **Update reset-code schema**
   - Stop storing plaintext OTPs.
   - Store a hash of the code instead.
   - Add fields needed for expiry, consumption, brute-force protection, and rate limiting.

   Suggested shape:

   ```sql
   ALTER TABLE password_reset_codes
     ADD COLUMN IF NOT EXISTS code_hash text,
     ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
     ADD COLUMN IF NOT EXISTS used_at timestamptz,
     ADD COLUMN IF NOT EXISTS locked_at timestamptz;

   CREATE INDEX IF NOT EXISTS idx_password_reset_codes_email_created_at
     ON password_reset_codes(email, created_at DESC);

   CREATE INDEX IF NOT EXISTS idx_password_reset_codes_active
     ON password_reset_codes(email, expires_at)
     WHERE used_at IS NULL;
   ```

4. **Create `request-reset-code` Edge Function**
   - Accept `{ email }`.
   - Normalize the email.
   - Return a generic success response whether or not the user exists.
   - Rate-limit requests to five codes per email per fifteen-minute window.
   - Generate a six-digit OTP server-side using secure randomness.
   - Hash the OTP before storing it.
   - Send the email server-side using Resend, Web3Forms, or the chosen provider secret from `Deno.env`.
   - Never return or log the OTP.

5. **Create `reset-password` Edge Function**
   - Accept `{ email, code, newPassword }`.
   - Validate input server-side.
   - Verify the code using the service-role key.
   - Increment failed attempts.
   - Reject expired, used, locked, or over-attempt codes.
   - Consume a valid code.
   - Call `supabase.auth.admin.updateUserById(...)` with the service-role key.
   - Return generic errors for invalid code, expired code, or reset failure.

6. **Prefer a DB helper for code verification**
   - Use a service-role-only SQL function for verification and consumption so the code row can be locked and updated atomically.
   - The Edge Function should call this helper, receive the target `user_id`, and then call `auth.admin.updateUserById`.
   - Treat password update failure after code consumption as recoverable: the user can request a new code. Do not leave a verified code reusable.

7. **Update the frontend**
   - Remove browser OTP generation from `components/auth/ResetPassword.tsx`.
   - Remove all reset-code console logging.
   - Remove `sendVerificationEmail` and `verifyCode` browser-side table access from `lib/email.ts`.
   - Replace the first step with `supabase.functions.invoke('request-reset-code', { body: { email } })`.
   - Replace the final password submission with `supabase.functions.invoke('reset-password', { body: { email, code, newPassword } })`.
   - Keep the UI generic to avoid email enumeration.

### Supabase DB Changes Required

- Drop or revoke `reset_user_password(TEXT, TEXT)`.
- Drop public RLS policies on `password_reset_codes`.
- Add reset-code columns for hashed codes, attempts, and consumption state.
- Add indexes for email-window rate limiting and active-code lookup.
- Optionally add a service-role-only verification RPC such as `verify_and_consume_reset_code(...)`.

### Acceptance Criteria

- Anonymous clients cannot execute any password-changing SQL RPC.
- Anonymous and authenticated clients cannot select, insert, or update `password_reset_codes` directly.
- No OTP is generated, stored, verified, or logged in browser code.
- Reset-code requests are rate-limited to five per email per fifteen minutes.
- Codes expire quickly, can be used once, and lock after too many failed attempts.
- Password reset succeeds only through the `reset-password` Edge Function using the service-role key.
- Production Supabase policies and functions match the committed migration files.

### Verification

- Attempting `supabase.rpc('reset_user_password', ...)` with the anon key fails.
- Attempting `select * from password_reset_codes` with the anon key fails.
- Attempting to insert or update `password_reset_codes` with the anon key fails.
- Browser bundle search shows no reset-code generation or OTP logging.
- End-to-end reset works through Edge Functions for a real test account.

### Implementation Notes

- Main Supabase project: `MementoLunarTech` / `cfaphpoblppwlomrtzwh`.
- Supabase Branching was attempted but rejected because the organization is on the Free plan.
- Backup metadata migration `backup_public_schema_before_password_reset` was applied before the reset migration.
- Safe reset migration `safe_password_reset` was applied to the main project.
- Edge Functions `request-reset-code` and `reset-password` were deployed with JWT verification enabled.
- `public.password_reset_codes` intentionally has RLS enabled with no public policies.
- Email delivery still requires a server-side Edge Function secret: `RESEND_API_KEY` or `WEB3FORMS_ACCESS_KEY`. Optional: `PASSWORD_RESET_EMAIL_FROM` and `PASSWORD_RESET_PEPPER`.

---

## P0-2. Lock Down `password_reset_codes`

**Status:** Implemented on main Supabase project

**Area:** Supabase DB, RLS, auth security

**Backup location:** `supabase/backups/`

**Implemented by migration:** `supabase/migrations/20260501000001_safe_password_reset.sql`

### Issue

The previous reset-code design allowed `anon` and `authenticated` users to `SELECT`, `INSERT`, and `UPDATE` rows in `password_reset_codes`. Because the old flow used six-digit OTPs and browser-side verification, any visitor could read live reset codes and bypass the intended email possession check.

### Impact

- Live OTPs could be read by anyone with the public anon key.
- Attackers could create or mutate reset-code rows directly.
- OTP brute force had no server-enforced attempt counter.
- Even if the password-changing RPC were removed, a public reset-code table would keep the reset flow untrustworthy.

### Fix Applied

- Dropped the old permissive reset-code SQL file: `supabase/password_reset_codes_table.sql`.
- Created `public.password_reset_codes` through the safe migration.
- Enabled RLS on `public.password_reset_codes`.
- Created no public RLS policies.
- Revoked table access from `anon` and `authenticated`.
- Granted table access only to `service_role`.
- Store reset codes as `code_hash`, not plaintext `code`.
- Added `attempts`, `expires_at`, `used_at`, and `locked_at`.
- Moved OTP generation and email sending to `request-reset-code`.
- Moved code verification and password reset to `reset-password`.

### Live Verification

- `public.password_reset_codes` has RLS enabled.
- `pg_policies` returns no policies for `public.password_reset_codes`.
- `information_schema.table_privileges` shows privileges only for `service_role` among `anon`, `authenticated`, and `service_role`.
- Columns present: `code_hash`, `attempts`, `expires_at`, `used_at`, `locked_at`.
- Browser code no longer imports `lib/email.ts` or calls direct reset-code table helpers.

### Advisor Note

Supabase Advisor reports `RLS Enabled No Policy` for `public.password_reset_codes`. This is expected and intentional: the table is service-role-only and should not expose public RLS policies.

---

## P0-3. Get Third-Party API Keys Out of the Browser

**Status:** Implemented in code; Supabase Edge Function secrets and deployment still required

**Area:** Frontend bundle, Docker build, GitHub Actions, Supabase Edge Functions, AI/email provider integrations

**Affected files:**
- `Dockerfile`
- `.github/workflows/docker.yml`
- `vite.config.ts`
- `vite-env.d.ts`
- `lib/serverOnlyProvider.ts`
- `lib/aiChat.ts`
- `lib/nvidiaEmbeddings.ts`
- `lib/fluxImageGenerator.ts`
- `lib/imageGenerator.ts`
- `lib/*Generator.ts`
- `lib/agents/*`
- `lib/documentGenerator/agents/*`
- `pages/NewNotebookSetup.tsx`
- `components/ChatInterface.tsx`
- `components/MentorHourModal.tsx`
- `supabase/functions/chat/index.ts`
- `supabase/functions/embed/index.ts`
- `supabase/functions/image/index.ts`
- `supabase/functions/tts/index.ts`
- `supabase/functions/email/index.ts`

### Issue

The frontend previously read provider keys from `VITE_*` environment variables and instantiated OpenAI-compatible clients in the browser with `dangerouslyAllowBrowser: true`. Any user could extract those keys from the generated JavaScript bundle or public Docker image layers.

The exposed keys included OpenAI, OpenRouter, NVIDIA, Google, FAL, and Web3Forms-style provider credentials. That creates unbounded billing risk because usage happens directly from the browser without a trusted server enforcing user identity, rate limits, quotas, or abuse controls.

### Impact

- Provider keys can be copied by any visitor.
- API spend cannot be tied reliably to an authenticated user.
- Provider-side quotas are shared across all users and attackers.
- Revoking leaked keys would be required after any public deployment.
- Browser network traffic exposes direct calls to provider domains.

### Fix Applied

- Removed provider API key build args and image environment variables from `Dockerfile`.
- Removed provider API key build args from `.github/workflows/docker.yml`.
- Removed the manual Vite `define` block that double-inlined environment values.
- Removed provider API key types from `vite-env.d.ts`.
- Removed browser-side OpenAI SDK clients and all `dangerouslyAllowBrowser: true` usage from active source paths.
- Replaced direct NVIDIA embedding calls with `supabase.functions.invoke('embed', ...)`.
- Replaced image generation wrappers with `supabase.functions.invoke('image', ...)`.
- Replaced the upload title-generation call with `supabase.functions.invoke('chat', ...)`.
- Added `lib/serverOnlyProvider.ts` as an OpenAI-compatible shim that routes existing chat, TTS, image, and embedding call sites through Supabase Edge Functions.
- Added Edge Function proxy scaffolds for:
  - `chat`
  - `embed`
  - `image`
  - `tts`
  - `email`

### Supabase Configuration Required

Set provider secrets in Supabase, not in Vite or browser env:

```bash
supabase secrets set OPENROUTER_API_KEY=...
supabase secrets set OPENAI_API_KEY=...
supabase secrets set NVIDIA_API_KEY=...
supabase secrets set RESEND_API_KEY=...
supabase secrets set WEB3FORMS_ACCESS_KEY=...
supabase secrets set APP_ORIGIN=https://your-production-origin
```

Only configure the providers actually used in production. `RESEND_API_KEY` and `WEB3FORMS_ACCESS_KEY` are alternatives for email; both are not required.

Deploy the new functions:

```bash
supabase functions deploy chat
supabase functions deploy embed
supabase functions deploy image
supabase functions deploy tts
supabase functions deploy email
```

### Acceptance Criteria

- `Dockerfile` and `.github/workflows/docker.yml` only pass public Supabase browser env values.
- `vite.config.ts` does not manually inline provider secrets.
- Browser source code does not reference provider `VITE_*_API_KEY` values.
- Browser source code has zero `dangerouslyAllowBrowser: true` occurrences.
- Browser source code does not instantiate OpenAI SDK clients with provider keys.
- AI, embedding, image, TTS, and email calls go through Supabase Edge Functions or a backend worker.
- Generated production bundle contains no provider key prefixes such as `sk-`, `sk-or-`, or `nvapi-`.
- Browser DevTools network trace shows no direct calls to `api.openai.com`, `openrouter.ai`, NVIDIA, FAL, or Web3Forms from the client.

### Verification

- `npm run build` completed locally after the code changes.
- Focused source scan for active build inputs returned no provider `VITE_*_API_KEY` references:

  ```bash
  rg -n "VITE_(OPENAI|OPENROUTER|NVIDIA|GOOGLE|FAL|WEB3FORMS)_API_KEY" Dockerfile .github/workflows/docker.yml vite.config.ts vite-env.d.ts lib pages components supabase/functions
  ```

- Active runtime source scan returned no `dangerouslyAllowBrowser`, `new OpenAI`, or OpenAI SDK imports in `lib`, `pages`, or `components`.
- Remaining matches are historical documentation references that still need doc cleanup.

### Follow-Up

- Deploy the five P0-3 Edge Functions to Supabase.
- Set Supabase provider secrets.
- Run an end-to-end chat, embedding, image, TTS, and email smoke test.
- Inspect browser DevTools Network after each smoke test to confirm provider calls originate from Supabase Functions only.
- Grep the built `dist/` bundle for known key prefixes before publishing any Docker image.

---

## P0-4. Close Stored-XSS Through AI-Rendered Markdown

**Status:** Implemented in code; CSP deployment remains defense-in-depth follow-up

**Area:** Markdown rendering, KaTeX, Mermaid diagrams, playback components, dependency security

**Affected files:**
- `lib/markdownRenderer.ts`
- `components/MermaidDiagram.tsx`
- `components/VideoOverviewPlayback.tsx`
- `package.json`
- `package-lock.json`

### Issue

AI-rendered markdown was sanitized with DOMPurify but the sanitizer explicitly allowed inline event handler attributes such as `onclick`, `onmouseover`, and `onmouseout`. The renderer also generated citation spans with inline JavaScript and rendered KaTeX with `trust: true`.

That output flows into `dangerouslySetInnerHTML` in playback surfaces that display AI-shaped summaries of uploaded content. Since uploaded PDFs and generated content are attacker-controlled input, allowing executable attributes creates a stored-XSS path inside authenticated sessions.

Mermaid diagrams were also rendered as SVG and injected directly into the parent document. The shared Mermaid renderer used `securityLevel: 'loose'` and `htmlLabels: true`, increasing the blast radius if hostile diagram content slips through.

### Impact

- A crafted uploaded document could influence AI-generated markdown.
- Generated markdown could preserve executable HTML attributes.
- Inline citation handlers made JavaScript execution part of sanitized content.
- KaTeX `trust: true` expanded the trusted rendering surface.
- Mermaid SVG injection could execute or interact in the parent document context if a bypass lands.

### Fix Applied

- Removed inline event handlers from DOMPurify `ADD_ATTR`.
- Added explicit sanitizer deny lists:
  - `FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed']`
  - `FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout']`
- Replaced inline citation JavaScript with `data-citation-id`.
- Added one delegated document click listener in trusted app code to dispatch the existing `citation-click` event.
- Set KaTeX rendering to `trust: false` and `strict: 'warn'`.
- Changed shared Mermaid config to `securityLevel: 'strict'` and `htmlLabels: false`.
- Changed the video playback Mermaid config to `securityLevel: 'strict'` and `htmlLabels: false`.
- Replaced direct Mermaid SVG `dangerouslySetInnerHTML` injection with sandboxed iframes using `srcDoc`.
- Used `sandbox="allow-scripts"` only, with no `allow-same-origin`.
- Upgraded DOMPurify to `3.4.2`.

### Must-Do Verification

Run after the dependency install and code changes:

```bash
npm run build
```

Confirm DOMPurify is upgraded:

```bash
npm ls dompurify
```

Expected installed version:

```text
dompurify@3.4.2
```

Scan the hardened files:

```bash
rg "onclick|onmouseover|onmouseout|onerror|onload|trust:\s*true|strict:\s*false|securityLevel:\s*'loose'" lib/markdownRenderer.ts components/MermaidDiagram.tsx components/VideoOverviewPlayback.tsx
```

The only expected match is the deny-list declaration in `lib/markdownRenderer.ts`.

### Acceptance Criteria

- Sanitized markdown cannot preserve inline event handler attributes.
- Citation clicks still work through delegated trusted code.
- KaTeX no longer runs in trust mode.
- Mermaid diagrams do not inject SVG directly into the parent document.
- Mermaid iframes do not include `allow-same-origin`.
- DOMPurify resolves to `3.4.2` or later.
- `npm run build` succeeds.

### Follow-Up

- Add a production CSP header from P1-4 as defense-in-depth.
- Smoke test citations in chat/report/handbook playback.
- Smoke test formulas in quiz, flashcards, reports, and visual slides.
- Smoke test Mermaid diagrams in handbook, report, and video overview playback.

---

## P0-5. Fix NVIDIA Embeddings in the Production Build

**Status:** Implemented in code; Supabase function deployment and `NVIDIA_API_KEY` secret required

**Area:** Embeddings, PDF upload, search/retrieval, Docker production build, CI

**Affected files:**
- `lib/nvidiaEmbeddings.ts`
- `supabase/functions/embed/index.ts`
- `vite.config.ts`
- `.github/workflows/docker.yml`
- `scripts/verify-production-embeddings.mjs`

### Issue

The old embedding implementation depended on the Vite dev proxy path `/nvidia-api`, which only exists while running the Vite dev server. In the nginx Docker image there is no `/nvidia-api` route, so production embedding requests would fail or 404.

Embeddings are required for PDF upload chunk indexing, search, chat retrieval, and LightRAG graph retrieval. A production-only failure here makes the app appear to work while document search and retrieval silently degrade.

### Impact

- PDF uploads can create sources without useful embeddings.
- Search and chat retrieval return poor or empty results.
- The failure only appears in the production Docker/nginx path, not local Vite dev.
- Downstream catch blocks can log the error without stopping the overall upload flow, hiding the regression from users.

### Fix Applied

- Removed the `/nvidia-api` Vite dev proxy from `vite.config.ts`.
- Updated `lib/nvidiaEmbeddings.ts` to call `supabase.functions.invoke('embed', ...)`.
- Standardized the client request body to `{ text: string[] }`.
- Added `supabase/functions/embed/index.ts`.
- The Edge Function reads `NVIDIA_API_KEY` from Supabase secrets and calls NVIDIA BGE-M3 server-side.
- The Edge Function validates that `text` is a non-empty string array.
- The Edge Function returns normalized `embeddings: number[][]`.
- Added a Docker-image CI guard that fails if built nginx assets contain `localhost:5173` or `/nvidia-api`.
- Added an optional live CI smoke test that calls the deployed `embed` function and asserts a 1024-dimensional vector when Supabase secrets are available.

### Supabase Configuration Required

Deploy the function:

```bash
supabase functions deploy embed
```

Set the provider secret in Supabase:

```bash
supabase secrets set NVIDIA_API_KEY=...
```

### Must-Do Verification

Run locally after changes:

```bash
npm run build
```

Scan active code for the old production-breaking proxy path:

```bash
rg "localhost:5173|/nvidia-api|VITE_NVIDIA_API_KEY" lib supabase vite.config.ts Dockerfile .github scripts components pages
```

The only expected `/nvidia-api` match is inside `scripts/verify-production-embeddings.mjs`, where CI checks that the built Docker bundle does not contain it.

After deploying the Edge Function and setting `NVIDIA_API_KEY`, smoke test:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/embed" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "content-type: application/json" \
  --data '{"text":["production embedding smoke test"]}'
```

Expected response includes `embeddings[0]` with 1024 numbers.

### Acceptance Criteria

- No runtime code calls `http://localhost:5173/nvidia-api` or `/nvidia-api`.
- No browser code reads `VITE_NVIDIA_API_KEY`.
- Production embedding calls go through `supabase.functions.invoke('embed', ...)`.
- NVIDIA provider key exists only as Supabase secret `NVIDIA_API_KEY`.
- The deployed `embed` function returns 1024-dimensional BGE-M3 vectors.
- CI fails if the built Docker/nginx assets contain the old dev proxy path.

### Follow-Up

- Add a full browser E2E test with a dedicated Supabase test project that uploads a tiny PDF through the built Docker image and asserts a stored chunk has a non-null 1024-dimensional embedding.
- Review upload catch blocks so embedding failures are visible to users instead of silently degrading retrieval.

---

## P0-6. Worker Service and Durable Job Queue

**Status:** Initial queue pipeline implemented; real generator porting and hosted worker deployment remain

**Area:** Supabase DB, Supabase Edge Functions, worker service, handbook generation, Realtime progress

**Affected files:**
- `supabase/migrations/0004_jobs_queue.sql`
- `supabase/functions/create-job/index.ts`
- `worker/Dockerfile`
- `worker/package.json`
- `worker/tsconfig.json`
- `worker/src/index.ts`
- `worker/src/jobs/dispatcher.ts`
- `worker/src/generators/handbook.ts`
- `worker/src/lib/db.ts`
- `worker/src/lib/supabase.ts`
- `worker/src/models.ts`
- `components/HandbookModal.tsx`

### Issue

Long-running generators currently run inside the user's browser tab. If the tab is closed, backgrounded, refreshed, or loses network, the work can be lost. A one-hour podcast, large handbook, or multi-phase asset generation has no durable checkpoint, no central retry policy, and no server-side place to attach rate limits, tracing, cost accounting, or failure observability.

### Impact

- Long jobs restart from zero after a tab or network failure.
- Mobile browser backgrounding can kill generation.
- Failed late phases waste all prior work.
- Rate limiting and quota enforcement are weak because the browser owns execution.
- There is no durable phase log for support or recovery.

### Fix Applied

- Added `public.job_status` enum with `queued`, `running`, `completed`, `failed`, and `dead`.
- Added `public.jobs` with ownership, status, phase, progress, attempts, error, cost, timestamps, and `available_at` for retry backoff.
- Added `public.job_phases` with `UNIQUE(job_id, phase)` as the resumability primitive.
- Enabled RLS on both tables.
- Added policies so users can see their own jobs and job phases.
- Added the tables to Supabase Realtime publication when available.
- Added `create-job` Edge Function:
  - Authenticates the caller.
  - Validates job type and input shape.
  - Inserts a queued job with service-role privileges.
  - Returns `{ jobId }`.
  - Leaves credit/quota enforcement as the Phase 3 hook.
- Scaffolded top-level `worker/` service:
  - Poll loop in `worker/src/index.ts`.
  - `SELECT ... FOR UPDATE SKIP LOCKED` claim path.
  - Dispatcher in `worker/src/jobs/dispatcher.ts`.
  - Stub handbook generator in `worker/src/generators/handbook.ts`.
  - Phase recording before job completion.
  - Retry behavior with exponential backoff using `2^attempts * 30s`.
  - Dead-letter status after three attempts.
- Updated `components/HandbookModal.tsx` to:
  - Submit handbook jobs through `supabase.functions.invoke('create-job', ...)`.
  - Subscribe to `postgres_changes` on the returned job row.
  - Render progress from the durable row.

### Supabase Deployment

- Migration `jobs_queue` was applied to main project `cfaphpoblppwlomrtzwh`.
- Edge Function `create-job` was deployed and is active with JWT verification enabled.
- Live table check confirmed:
  - `public.jobs` exists with RLS enabled.
  - `public.job_phases` exists with RLS enabled.

### Worker Environment Required

The worker needs these environment variables:

```bash
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_SSL=true
WORKER_POLL_INTERVAL_MS=2000
```

`DATABASE_URL` must point at the Supabase Postgres database. Use the service role key only in the worker runtime, never in browser code.

### Must-Do Verification

Build the browser app:

```bash
npm run build
```

Build the worker:

```bash
cd worker
npm install
npm run build
```

Deploy or run the worker with the required env vars. Then create a handbook job from the UI and confirm:

- A row appears in `public.jobs`.
- Status transitions from `queued` to `running` to `completed`.
- `public.job_phases` contains `handbook:accepted` and `handbook:stub-complete`.
- The browser progress UI updates over Supabase Realtime.

### Acceptance Criteria

- Browser does not run the handbook proof-of-concept directly in-tab.
- Browser creates a durable job via `create-job`.
- Users can only see their own job rows.
- Worker claims jobs with `FOR UPDATE SKIP LOCKED`.
- Worker records completed phases idempotently.
- Worker can resume by skipping existing phase rows.
- Failed jobs are requeued until attempts reach three.
- Jobs are marked `dead` after three failed attempts.

### Follow-Up

- Port the real handbook generator into worker phases: research, outline, draft, continuation, finalization, save.
- Store the generated handbook output from the worker and return/open it from the UI.
- Add Sentry event emission for dead jobs.
- Add credit/quota checks in `create-job`.
- Add hosted deployment configuration for Fly.io or Railway.
- Apply the same queue pattern to report, podcast, video, quiz, flashcards, and mindmap generation.

---

## P0-7. Move Chat and Embeddings Server-Side

**Status:** Implemented in code; provider/Sentry secrets and worker install/build verification required

**Area:** Chat, embeddings, Supabase Edge Functions, browser bundle, Sentry observability, worker observability

**Affected files:**
- `lib/aiChat.ts`
- `lib/nvidiaEmbeddings.ts`
- `lib/documentProcessor.ts`
- `components/ChatInterface.tsx`
- `supabase/functions/chat/index.ts`
- `supabase/functions/embed/index.ts`
- `index.tsx`
- `vite-env.d.ts`
- `package.json`
- `package-lock.json`
- `worker/package.json`
- `worker/src/lib/sentry.ts`
- `worker/src/index.ts`
- `worker/src/jobs/dispatcher.ts`

### Issue

Chat and embedding traffic are high-volume AI paths. When provider calls run in the browser, API keys can leak, users can bypass central rate limits, and usage cannot be reliably attributed or throttled.

Embeddings also need to be server-side because document upload, retrieval, and chat context all depend on a provider key that must not live in the browser bundle.

### Impact

- A user loop can drain shared OpenRouter/OpenAI/NVIDIA budget.
- No trusted server boundary exists for rate limiting or usage accounting.
- Browser network traces can expose direct provider calls.
- Errors from chat and worker jobs lack central production observability.

### Fix Applied

- Replaced `lib/aiChat.ts` with a thin wrapper around `supabase.functions.invoke('chat', ...)`.
- Updated `components/ChatInterface.tsx` to use the `aiChat` wrapper for main chat, suggested prompts, and initial notebook analysis.
- Removed the browser chat provider shim from `ChatInterface`.
- Implemented `supabase/functions/chat/index.ts`:
  - Authenticates the caller.
  - Validates notebook ownership.
  - Generates query embeddings server-side using `NVIDIA_API_KEY`.
  - Retrieves matching chunks through `match_document_chunks`.
  - Builds citation details server-side.
  - Calls OpenRouter/OpenAI server-side using Supabase secrets.
  - Returns `{ message, citations, citationDetails }`.
- `lib/nvidiaEmbeddings.ts` already routes document/query embeddings through `supabase.functions.invoke('embed', ...)`.
- `supabase/functions/embed/index.ts` validates `{ text: string[] }` and calls NVIDIA server-side.
- Deployed `chat` Edge Function to project `cfaphpoblppwlomrtzwh` with JWT verification enabled.
- Added `@sentry/react` wiring in `index.tsx`.
- Added `@sentry/node` wiring in the worker, including dead-letter capture.

### Secrets Required

Supabase Edge Function secrets:

```bash
supabase secrets set OPENROUTER_API_KEY=...
supabase secrets set NVIDIA_API_KEY=...
supabase secrets set APP_ORIGIN=https://your-production-origin
```

Use `OPENAI_API_KEY` only if falling back to OpenAI instead of OpenRouter:

```bash
supabase secrets set OPENAI_API_KEY=...
```

Browser deployment env:

```bash
VITE_SENTRY_DSN=...
```

Worker env:

```bash
SENTRY_DSN=...
SENTRY_ENVIRONMENT=production
```

### Must-Do Commands

Install the new browser dependency and update the lockfile:

```bash
npm install
```

Install worker dependencies and create the worker lockfile:

```bash
cd worker
npm install
npm run build
```

Build the browser app:

```bash
npm run build
```

### Verification

Source scan:

```bash
rg "openrouter|api\\.openai\\.com|OPENROUTER_API_KEY|OPENAI_API_KEY|VITE_OPENROUTER|VITE_OPENAI|dangerouslyAllowBrowser|new OpenAI" lib/aiChat.ts components/ChatInterface.tsx lib/documentProcessor.ts lib/nvidiaEmbeddings.ts
```

Expected: no matches.

Edge Function scan:

```bash
rg "OPENROUTER_API_KEY|OPENAI_API_KEY|NVIDIA_API_KEY|openrouter.ai|api\\.openai\\.com|integrate.api.nvidia.com" supabase/functions/chat supabase/functions/embed
```

Expected: matches only in Supabase Edge Functions.

Runtime verification:

- Open DevTools Network tab.
- Generate a chat response.
- Confirm browser calls Supabase Functions only.
- Confirm there are zero direct browser calls to `api.openai.com`, `openrouter.ai`, or NVIDIA.

### Acceptance Criteria

- Browser chat calls go through `supabase.functions.invoke('chat', ...)`.
- Browser embedding calls go through `supabase.functions.invoke('embed', ...)`.
- Browser code contains no AI provider keys.
- Browser code makes no direct provider network calls for chat or embeddings.
- `chat` Edge Function performs retrieval and completion server-side.
- `embed` Edge Function performs NVIDIA calls server-side.
- Sentry is initialized in browser and worker when DSNs are configured.

### Follow-Up

- Add rate limiting and usage accounting inside `chat` and `embed`.
- Add streaming support to the browser wrapper if needed; current browser wrapper receives one server-side response and emits it through the existing callback once.
- Move broader LightRAG entity/relationship retrieval fully server-side for richer chat context.
- Add Sentry release/version metadata during deployment.

---

## P0-8. Audio Worker with FFmpeg

**Status:** Worker audio pipeline implemented; device playback QA still required

**Area:** Audio generation, TTS, FFmpeg mixing, worker queue, resumability, media compatibility

**Affected files:**
- `worker/Dockerfile`
- `worker/src/lib/ffmpeg.ts`
- `worker/src/generators/audio.ts`
- `worker/src/jobs/dispatcher.ts`
- `supabase/functions/create-job/index.ts`
- `components/AudioOverviewModal.tsx`
- `components/StudioPanel.tsx`
- `lib/agents/ttsWorkerPool.ts`
- `lib/agents/audioMixer.ts`
- `lib/agents/audioMasterAgent.ts`

### Issue

The browser audio pipeline assembled MP3 output by concatenating segment byte arrays and inserting zero-filled byte arrays as fake silence. MP3 is a framed format, so zero-byte padding can create malformed frames. Some browsers tolerate this, but iOS Safari and podcast players can reject or misread the result.

The previous duration calculation estimated seconds from byte length and a fixed bitrate. That is inaccurate for variable-bitrate TTS output and causes visible drift in video/audio synchronization.

The TTS worker pool also placed completed segments into `results.findIndex(r => !r)` rather than their true segment order, which can reorder split segments under parallel execution. The old `originalIndex * 100` key space was also too small for long split sequences.

Browser localStorage checkpointing in `audioMasterAgent` attempted to preserve `ArrayBuffer` data through JSON serialization, which serializes as `{}` and cannot resume real audio work.

### Impact

- Downloaded MP3s can be malformed.
- iOS Safari and podcast apps may reject generated audio.
- Slide timings can drift because duration metadata is estimated.
- Long podcasts can produce out-of-order segments.
- Failed long jobs have no durable resume point and can repeat expensive TTS work.

### Fix Applied

- Changed worker base image to `node:20-bookworm-slim`.
- Installed FFmpeg in the worker image:

  ```dockerfile
  RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*
  ```

- Added `worker/src/lib/ffmpeg.ts`:
  - Uses `ffprobe` to read exact `format.duration`.
  - Generates silence with `anullsrc`, not zero-byte padding.
  - Mixes MP3 segments with FFmpeg concat demuxer.
  - Applies `loudnorm`.
  - Encodes final output with `libmp3lame`.
- Added `worker/src/generators/audio.ts`:
  - Generates scripts server-side from notebook sources using `OPENROUTER_API_KEY` or `OPENAI_API_KEY`.
  - Runs TTS server-side using `OPENAI_API_KEY`.
  - Writes every completed TTS segment to Supabase Storage.
  - Writes a `job_phases` row for each `tts:segment:N` before advancing.
  - Resumes by reusing existing segment phase rows and storage paths.
  - Produces final `audio:mix` and `audio:completed` phases.
  - Inserts the final playable asset into `generated_assets`.
- Added `audio` to the worker dispatcher.
- Updated `create-job` to accept `audio` jobs and redeployed it to Supabase.
- Updated `AudioOverviewModal` and inline audio regeneration to submit worker jobs through `create-job`.
- Fixed `lib/agents/ttsWorkerPool.ts` ordering:
  - Uses `Map<number, ProcessedSegment>`.
  - Keys by `originalIndex * 1000 + splitIndex`.
  - Returns sorted results.
- Replaced fixed-bitrate browser duration estimation with `<audio>` metadata probing.
- Replaced browser `AudioMixerAgent` byte-concat implementation with a fail-closed error requiring worker/FFmpeg mixing.
- Removed `JobStateManager` localStorage checkpoint usage from `audioMasterAgent`.

### Worker Environment Required

```bash
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
OPENROUTER_API_KEY=...
APP_ORIGIN=https://your-app.example
DATABASE_SSL=true
WORKER_POLL_INTERVAL_MS=2000
```

### Job Input Shape

The worker accepts an `audio` job with generation options:

```json
{
  "type": "audio",
  "input": {
    "notebookId": "notebook-id",
    "title": "Audio Overview - Deep Dive",
    "format": "deep-dive",
    "duration": "10min",
    "graphMode": "broad",
    "customPrompt": "Focus on practical applications",
    "speakerNames": {
      "host1": "Alex",
      "host2": "Jordan",
      "solo": "Alex"
    }
  }
}
```

It also accepts prebuilt segments for tests or future specialized generators:

```json
{
  "type": "audio",
  "input": {
    "notebookId": "notebook-id",
    "segments": [
      { "speaker": "host1", "text": "Intro text" },
      { "speaker": "host2", "text": "Response text" }
    ],
    "silenceGapMs": 200
  }
}
```

It also accepts a single `prompt`, `message`, or `text` as a one-segment fallback.

### Must-Do Commands

Build the browser app:

```bash
npm run build
```

Build the worker:

```bash
cd worker
npm install
npm run build
```

Build the worker Docker image and confirm FFmpeg exists:

```bash
docker build -t memento-worker ./worker
docker run --rm memento-worker ffmpeg -version
```

### Verification

Source scan:

```bash
rg "findIndex\\(r => !r\\)|originalIndex \\* 100[^0]|createSilenceBuffer|new Uint8Array\\(size\\)|bytesPerSecond|stateManager|JobStateManager|TODO: Implement resume logic" lib/agents/audioMasterAgent.ts lib/agents/audioMixer.ts lib/agents/ttsWorkerPool.ts worker/src
```

Expected: no matches.

Worker implementation scan:

```bash
rg "ffmpeg|ffprobe|anullsrc|loudnorm|tts:segment|audio:mix|OPENAI_API_KEY" worker
```

Expected: matches in worker implementation files.

Acceptance media test:

- Create a 5-minute `audio` job.
- Let the worker complete it.
- Download the final MP3 from the `audio:mix` / `audio:completed` storage path.
- Verify it plays in VLC.
- Verify it plays in iOS Safari.
- Verify `ffprobe` duration matches expected generated duration.

### Acceptance Criteria

- Browser code no longer creates silence by zero-byte padding MP3 data.
- Browser code no longer concatenates MP3 byte streams.
- TTS segment ordering is stable under parallel completion.
- Audio duration uses media metadata probing, not fixed bitrate math.
- Worker image includes FFmpeg and ffprobe.
- Worker writes each TTS segment as a durable `job_phases` checkpoint.
- Worker resumes by skipping/downloading existing completed TTS segment phases.
- Final worker output is a valid loudness-normalized MP3.

### Follow-Up

- Store final audio metadata in a typed generated-assets row.
- Add automated MP3 validation in CI with `ffprobe`.

---

## P0-9. Handbook and Report Relational Persistence

**Status:** Relational schema applied; worker persistence implemented; full legacy cleanup still needs build verification

**Area:** Handbook/report storage, worker generation, list queries, full-text search

**Affected files:**
- `supabase/migrations/0005_relational_content.sql`
- `worker/src/generators/handbook.ts`
- `worker/src/generators/report.ts`
- `worker/src/generators/contentPersistence.ts`
- `worker/src/generators/documentContent.ts`
- `worker/src/generators/markdown.ts`
- `worker/src/jobs/dispatcher.ts`
- `lib/relationalContent.ts`
- `lib/handbookGenerator.ts`
- `lib/reportGenerator.ts`
- `components/StudioPanel.tsx`
- `components/ReportModal.tsx`
- `supabase/functions/create-job/index.ts`

### Issue

Handbooks and reports were stored as whole `GeneratedHandbook` / `GeneratedReport` objects inside `generated_assets.metadata`. For long content, that means list queries can drag large toasted JSONB payloads through Postgres and the browser even when the UI only needs title, format, word count, and creation time.

The JSONB blob shape also prevents per-section edits, per-section search, partial updates, and targeted indexing. Updating one section rewrites the whole generated asset blob.

### Fix Applied

- Added `handbooks` and `handbook_sections`.
- Added `reports` and `report_sections`.
- Added generated `tsvector` search columns and GIN indexes on section content.
- Added notebook/date and user/date indexes for cheap list views.
- Enabled RLS on all four tables.
- Added owner policies for top-level rows and section read policies through their parent rows.
- Ported worker handbook generation from the previous stub into `worker/src/generators/handbook.ts`.
- Added `worker/src/generators/report.ts`.
- Added shared worker helpers for notebook context loading, markdown parsing, LLM generation, and relational inserts.
- Updated the worker dispatcher to support `report`.
- Updated `create-job` validation and redeployed it as version 3.
- Updated `StudioPanel` to list relational handbook/report summaries and fetch sections only when opening playback.
- Updated legacy `saveHandbook()` and `saveReport()` helpers to write relational rows instead of full JSONB blobs.

### Supabase Note

The live Supabase project did not currently contain `public.notebooks`, so the applied migration stores `notebook_id uuid NOT NULL` without a foreign key. The local migration matches that deployed shape. If/when the notebook table is added to the production schema, add a follow-up migration to attach the FK:

```sql
ALTER TABLE public.handbooks
  ADD CONSTRAINT handbooks_notebook_id_fkey
  FOREIGN KEY (notebook_id) REFERENCES public.notebooks(id) ON DELETE CASCADE;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_notebook_id_fkey
  FOREIGN KEY (notebook_id) REFERENCES public.notebooks(id) ON DELETE CASCADE;
```

### Must-Do Commands

Build the browser app:

```bash
npm run build
```

Build the worker:

```bash
cd worker
npm install
npm run build
```

### Verification

Source scan:

```bash
rg "metadata\\.(handbookData|reportData)|generated_assets.*handbook|generated_assets.*report|saveHandbook\\(|saveReport\\(" lib components worker
```

Expected:
- No new handbook/report saves to `generated_assets.metadata`.
- Existing legacy playback compatibility may still read old `metadata.handbookData` / `metadata.reportData`.

Database verification:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('handbooks','handbook_sections','reports','report_sections');
```

Acceptance test:

- Generate a handbook.
- Confirm one row in `handbooks` and multiple rows in `handbook_sections`.
- Open the handbook from Studio and confirm sections render in order.
- Generate a report.
- Confirm one row in `reports` and multiple rows in `report_sections`.
- Open the report from Studio and confirm sections render in order.

### Follow-Up

- Remove old generated-assets handbook/report compatibility once existing saved blobs are migrated.
- Backfill existing JSONB handbooks/reports into relational tables.
- Add section edit/update APIs.
- Add UI search backed by `handbook_sections.search_vector` and `report_sections.search_vector`.
- Add FK constraints once the production notebook table exists in the Supabase project.

---

## P0-10. Quiz, Flashcard, Mind Map Workers and Usage Tracking

**Status:** Implemented; build verification still required

**Area:** Worker generation, quota/usage accounting, inference spend traceability

**Affected files:**
- `supabase/migrations/0006_usage_events.sql`
- `worker/src/lib/usage.ts`
- `worker/src/generators/studyArtifacts.ts`
- `worker/src/generators/documentContent.ts`
- `worker/src/generators/audio.ts`
- `worker/src/jobs/dispatcher.ts`
- `components/QuizModal.tsx`
- `components/FlashcardsModal.tsx`
- `components/MindMapModal.tsx`
- `supabase/functions/create-job/index.ts`

### Issue

Quiz, flashcard, and mind map generation still ran from the browser path. Even when proxied through server-only shims, that left the UI responsible for paid generation workflows and made quota/rate enforcement hard to centralize.

There was also no durable usage ledger. Without a `usage_events` table, provider spend could not be traced to a user, job, or phase, which blocks credits, quotas, abuse controls, and cost reporting.

### Fix Applied

- Added `usage_events`:
  - `user_id`
  - `job_id`
  - `provider`
  - `model`
  - token/char/image counters
  - `cost_usd`
  - `created_at`
- Added indexes on `(user_id, created_at)` and `job_id`.
- Enabled RLS so users can read only their own usage rows.
- Added `worker/src/lib/usage.ts`:
  - `trackedCompletion()` wraps chat completion calls.
  - `recordUsage()` inserts a usage event.
  - `recordUsage()` increments `jobs.cost_usd`.
- Updated handbook/report worker completions to use `trackedCompletion()`.
- Updated audio script generation to use `trackedCompletion()`.
- Updated audio TTS to call `recordUsage()` with character-based OpenAI TTS cost estimates.
- Added `worker/src/generators/studyArtifacts.ts`:
  - `runQuizJob`
  - `runFlashcardsJob`
  - `runMindMapJob`
- Wired `quiz`, `flashcards`, and `mindmap` into the worker dispatcher.
- Updated Quiz, Flashcards, and Mind Map modals to enqueue `create-job` jobs instead of running browser generation.
- Redeployed `create-job` as version 4 with validation for quiz/flashcards/mindmap `notebookId`.

### Supabase

Applied migration:

```text
usage_events
```

Live table confirmed:

```text
public.usage_events
```

### Must-Do Commands

Build the browser app:

```bash
npm run build
```

Build the worker:

```bash
cd worker
npm install
npm run build
```

### Verification

Source scan:

```bash
rg "trackedCompletion|recordUsage|usage_events|runQuizJob|runFlashcardsJob|runMindMapJob" worker supabase/migrations
```

Runtime checks:

- Generate a quiz and confirm a `jobs` row is queued and completed by the worker.
- Confirm a `generated_assets` row with `type = 'quiz'`.
- Confirm one or more `usage_events` rows for that job.
- Repeat for flashcards and mind map.
- Confirm `jobs.cost_usd` increments above zero when provider usage is recorded.

### Follow-Up

- Replace estimated token pricing with exact provider price tables.
- Add usage events for image generation functions and any remaining Edge Function provider calls.
- Add quota checks in `create-job` before insertion.
- Add a user-facing usage/credits dashboard.

---

## P0-11. Stripe Billing and Credits

**Status:** Planned only; not implemented

**Area:** Billing, subscriptions, credits, Stripe checkout/webhooks, job quota enforcement

**Affected files planned:**
- `supabase/migrations/0007_plans_and_credits.sql`
- `supabase/functions/create-checkout/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `supabase/functions/create-job/index.ts`
- React billing/settings route, likely `/settings/billing`
- Any app navigation/settings components needed to expose billing

### Issue

After moving generation behind server-side workers and Edge Functions, provider keys are no longer exposed in the browser, but compute is still not economically bounded. Without a credits system, any authenticated user can keep queuing paid jobs until provider budgets are exhausted.

The server-side job queue creates the enforcement point, but it must be connected to plans, subscriptions, and per-job credit deductions before usage can be safely monetized.

### Impact

- Unlimited compute consumption per user.
- No enforceable Free / Pro / Team limits.
- No subscription state in the database.
- No checkout flow for upgrades.
- No webhook-driven renewal/downgrade handling.
- No way for `create-job` to reject exhausted users before paid work is queued.

### Fix Plan

Add a billing schema in `0007_plans_and_credits.sql`:

```sql
CREATE TABLE plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  monthly_credits int NOT NULL,
  stripe_price_id text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE user_subscriptions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text REFERENCES plans(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL,
  current_period_end timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE user_credits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text REFERENCES plans(id),
  credits_remaining int NOT NULL,
  credits_used int NOT NULL DEFAULT 0,
  period_started_at timestamptz DEFAULT now(),
  period_ends_at timestamptz,
  updated_at timestamptz DEFAULT now()
);
```

Seed initial plan rows:

```text
Free: 50 credits/month
Pro: 500 credits/month
Team: amount TBD
```

Create matching Stripe products/prices manually in Stripe:

- Free
- Pro
- Team

Build `create-checkout` Edge Function:

- Authenticates the current user.
- Accepts a target `planId`.
- Creates or reuses a Stripe customer.
- Creates a Stripe Checkout session for the selected price.
- Returns `{ url }`.

Build `stripe-webhook` Edge Function:

- Uses the raw request body.
- Verifies the `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET`.
- Handles `checkout.session.completed`.
- Handles `invoice.payment_succeeded`.
- Handles `customer.subscription.deleted`.
- Upserts `user_subscriptions`.
- Resets `user_credits` to the plan allowance on successful checkout/renewal.
- Downgrades deleted subscriptions to Free.

Update `create-job`:

- Resolve job credit cost before queue insert.
- Check `user_credits.credits_remaining >= job_cost`.
- Return `{ error: 'insufficient_credits' }` when exhausted.
- Deduct credits atomically before inserting the job.
- Recommended initial costs:
  - `quiz`: 1 credit
  - `flashcards`: 1 credit
  - `mindmap`: 1 credit
  - `report`: 2 credits
  - `handbook`: 3 credits
  - `audio`: 5 credits
  - `video`: 5 credits

Add monthly reset:

- Use `pg_cron` if available.
- Reset Free balances on the first of each month.
- Stripe-paid plans should primarily reset from Stripe renewal webhooks.

Add `/settings/billing`:

- Current plan.
- Credits used / remaining.
- Upgrade button.
- Customer Portal link.
- Realtime refresh when `user_credits` changes.

### Security Requirements

- `stripe-webhook` must validate `Stripe-Signature`.
- Never trust client-submitted plan names, prices, or credit amounts.
- Credit deduction must be server-side only.
- `create-job` must be the enforcement point before queue insertion.
- RLS should allow users to read only their own subscription and credit rows.
- Webhook writes must use service-role access.

### Supabase DB Changes Required

Yes:

- `plans`
- `user_subscriptions`
- `user_credits`
- RLS policies for user reads.
- Service-role-only webhook writes.
- Optional `pg_cron` monthly reset job.

### Acceptance Criteria

- A new user starts on Free with 50 credits.
- Generating a quiz deducts 1 credit.
- Generating a handbook deducts 3 credits.
- Generating audio deducts 5 credits.
- Exhausted users receive `{ error: 'insufficient_credits' }` from `create-job`.
- Upgrading to Pro through Stripe resets credits to 500.
- Subscription cancellation downgrades the user to Free.
- Billing page shows accurate plan and credit usage.
- Stripe webhook rejects requests with invalid or missing signatures.

### Verification

- Stripe CLI sends signed test events successfully.
- Unsigned webhook POST is rejected.
- `checkout.session.completed` upserts subscription and credits.
- `invoice.payment_succeeded` resets credits for the new period.
- `customer.subscription.deleted` downgrades to Free.
- `create-job` deducts the correct credit amount per job type.
- Realtime billing UI updates after credit deduction.

---

## P1-2. Consolidate Supabase Migrations

Status: Implemented locally. CI validation is deferred.

### Issue

The Supabase schema was split across conflicting top-level SQL files:

- `supabase/setup-database.sql`
- `supabase/schema_safe.sql`
- `supabase/migrate-to-1024-dimensions.sql`
- `supabase/lightrag-functions.sql`
- `supabase/match_document_chunks.sql`
- `supabase/fix-generated-assets-timeout.sql`
- `supabase/setup-storage-assets.sql`

Those files did not define the same schema. The highest-risk drift was:

- `document_chunks.embedding` was defined as both `vector(1536)` and `vector(1024)`.
- `match_document_chunks` could be created against the wrong vector dimension.
- `notebooks.user_id` referenced different parent tables in different files.
- Setup order depended on manual execution rather than a timestamped migration chain.

### Impact

A fresh environment could come up with a subtly broken RAG schema. The most likely failure mode was embeddings stored at 1024 dimensions while retrieval functions expected 1536 dimensions, causing document search and chat retrieval to fail.

### Fix Applied

Created canonical ordered migrations under `supabase/migrations/`:

- `0001_initial_schema.sql`
  - Canonical initial schema from the old setup SQL.
  - Uses `auth.users(id)` for `notebooks.user_id`.
  - Defines `document_chunks.embedding` as `vector(1024)`.
  - Includes generated asset timeout indexes.
  - Includes realtime publication setup for `generated_assets`.
- `0002_lightrag_1024_dim.sql`
  - Canonical 1024-dimension LightRAG table migration.
  - Rebuilds document chunk embeddings and graph embeddings as `vector(1024)`.
- `0003_lightrag_functions.sql`
  - Recreates LightRAG match functions with `query_embedding vector(1024)`.
- `0004_jobs_queue.sql`
  - Existing durable job queue migration from P0-6.
- `0005_relational_content.sql`
  - Existing relational handbooks/reports migration from P0-9.
  - Updated for fresh environments so handbook/report `notebook_id` references canonical `public.notebooks(id)`.
- `0006_usage_events.sql`
  - Existing usage tracking migration from P0-10.
- `0008_lock_down_assets_storage.sql`
  - Existing locked-down assets bucket migration from P1-1.

Deleted the conflicting top-level schema SQL files after their contents were represented by migrations.

### Deferred Work

`0007_plans_and_credits.sql` remains intentionally absent until P0-11 is implemented. P0-11 was documented as planned work only.

### CI TODO

Add a GitHub Actions job later that validates migrations against a fresh Supabase environment:

```bash
supabase db reset
supabase db push
supabase db lint
```

The CI job should fail PRs when migrations conflict, recreate functions with the wrong vector dimension, or drift from the canonical schema.

### Verification

Local verification target:

- No `vector(1536)` remains in Supabase migrations.
- `match_document_chunks` accepts `vector(1024)`.
- `notebooks.user_id` references `auth.users(id)`.
- No schema-defining SQL remains at the top level of `supabase/`.
- Fresh schema setup order is controlled by `supabase/migrations/`.

---

## P1-3. CI/CD Security Gates

Status: Partially implemented. GHCR publishing is configured for `main` and `memento-docker` while migration is in progress; PR gates, tag-only releases, SBOM, scan, signing, and action SHA pinning remain TODO.

### Issue

The current release pipeline does not yet enforce security gates before publishing images. The Docker workflow also needs to stop pushing every feature-branch build as `latest`, avoid long-lived registry credentials, and produce verifiable image provenance.

### Impact

A vulnerable dependency, broken typecheck, unsigned image, or tampered container can reach production without a blocking control. Long-lived registry tokens also create a high-impact credential theft path.

### Fix Plan

Add a PR-check workflow that does not push images:

- `npm run typecheck`
- `npm run lint`
- `npm test` or the project test command
- `npm audit --omit=dev --audit-level=high`
- Supabase migration validation from P1-2:
  - `supabase db reset`
  - `supabase db push`
  - `supabase db lint`

Add a release workflow that only publishes on version tags:

```yaml
on:
  push:
    tags:
      - 'v*'
```

Implemented in `.github/workflows/docker.yml`:

- Publishes to `ghcr.io/lunartech-x/memento`.
- Runs on `main` and `memento-docker` pushes plus manual dispatch for the current migration period.
- Authenticates to GHCR with the built-in `GITHUB_TOKEN`.
- Uses explicit `contents: read`, `packages: write`, and `id-token: write` permissions.
- Removes Docker Hub registry credentials from the publish path.
- Runs the embedding smoke check against the pushed GHCR `sha-${GITHUB_SHA}` image instead of a second local-only Docker build.
- Uses the public Supabase project URL `https://cfaphpoblppwlomrtzwh.supabase.co` directly in the workflow and keeps `VITE_SUPABASE_ANON_KEY` as the GitHub secret.
- Keeps the bundle regression check mandatory, but skips the live `embed` Edge Function smoke check when the configured anon key is not JWT-shaped. A legacy anon JWT is required for that live smoke test if the function has JWT verification enabled.

GitHub build provenance attestation is temporarily removed from `.github/workflows/docker.yml` because the LUNARTECH-X organization cannot persist attestations on the current billing/repository visibility setup. Re-enable `actions/attest-build-provenance` after either:

- Making the repository public.
- Upgrading the organization plan so private-repo attestations are available.

Before broad production release, switch the trigger back to `v*` tags:

```yaml
on:
  push:
    tags:
      - 'v*'
```

Add container supply-chain gates:

- Scan images with Trivy.
- Generate SBOMs with Syft.
- Sign images with Cosign.
- Publish to GHCR using GitHub OIDC instead of a long-lived Docker Hub PAT.
- Pin every `actions/*` dependency by full commit SHA.
- Set explicit workflow permissions per job:
  - `contents: read`
  - `packages: write`
  - `id-token: write`

### Acceptance Criteria

- PRs fail on lint, typecheck, tests, high production dependency audit findings, migration drift, or image scan failures.
- Images publish only from `v*` tags.
- Published images have an SBOM and Cosign signature.
- Registry auth uses short-lived OIDC credentials.
- Workflow actions are pinned by SHA.

### Verification

- Open a PR with a known lint/type/test failure and confirm it blocks.
- Open a PR with a Supabase migration conflict and confirm `db-check` blocks.
- Push a non-tag commit and confirm no image is published.
- Push a `v*` tag and confirm the image is scanned, signed, has an SBOM, and is pushed to GHCR.

---

## P1-4. Harden nginx

Status: Implemented locally.

### Issue

The production nginx container did not emit security headers, did not expose a health endpoint, used floating base image tags, and ran nginx as root.

### Impact

Missing headers left the app without baseline browser protections such as CSP, HSTS, MIME sniffing prevention, referrer control, and browser permissions restrictions. Floating base tags could change underneath the build without review, and a root nginx worker increases container blast radius.

### Fix Applied

Updated `nginx.conf`:

- Added `Content-Security-Policy`.
- Added `Strict-Transport-Security`.
- Added `X-Content-Type-Options`.
- Added `Referrer-Policy`.
- Added `Permissions-Policy`.
- Added `server_tokens off`.
- Added `GET /healthz`.
- Switched nginx to listen on `8080` so it can run as a non-root user without privileged bind capabilities.

Updated `Dockerfile`:

- Pinned `node:20.18-alpine` by digest.
- Pinned `nginx:1.27-alpine` by digest.
- Set `NODE_ENV=production` after `npm ci`.
- Runs final nginx stage as `USER nginx`.
- Exposes `8080`.
- Adds a Docker `HEALTHCHECK` against `/healthz`.
- Makes nginx runtime, cache, and log directories writable by the `nginx` user.
- Moves the nginx PID file to `/tmp/nginx.pid` in the image before dropping privileges.
- Moves nginx access/error logs to `/tmp` so non-root config validation and startup can open them.
- Starts nginx with `-e /tmp/nginx-error.log` so the initial error log opens without root.

### Deployment Note

Because the container now listens on `8080`, the hosting platform should map external HTTP/HTTPS traffic to container port `8080`.

Drop Linux capabilities in the deployment/runtime config because this repo does not currently include a compose or orchestrator manifest:

```yaml
cap_drop:
  - ALL
security_opt:
  - no-new-privileges:true
```

### Verification

Local verification target:

- Container starts successfully.
- `GET /healthz` returns `200`.
- Response headers include CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- Nginx does not leak its version through `Server` tokens.
- Docker reports the container as healthy.

---

## P1-5. Bundle the PDF.js Worker Locally

Status: Implemented locally.

### Issue

PDF processing loaded the PDF.js worker from `cdnjs.cloudflare.com` at runtime.

### Impact

That external worker is a supply-chain dependency inside the PDF upload path. It also conflicts with the hardened CSP from P1-4 because a strict `script-src 'self'` policy should not allow third-party worker code.

### Fix Applied

Updated PDF processing code to import the worker through Vite:

```ts
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';
```

Then set:

```ts
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
```

Affected files:

- `lib/documentProcessor.ts`
- `lib/pdfProcessor.ts`

### Acceptance Criteria

- No PDF.js worker is loaded from cdnjs.
- The worker is emitted as part of the local Vite build.
- PDF uploads still extract text successfully.
- CSP can keep PDF worker execution within the app origin.

### Verification

- Grep for `cdnjs.cloudflare.com`, `pdf.worker.min.js`, and external `workerSrc` references.
- Run `npm run build`.
- Upload a PDF and confirm text extraction still works.

---

## P1-6. Patch Vulnerable Dependencies

Status: Implemented locally. Residual moderate transitive advisories remain.

### Issue

`npm audit --omit=dev` reported vulnerable runtime dependencies in libraries that sit directly on Memento's untrusted-content paths:

- `pdfjs-dist` in PDF upload/parsing.
- `jspdf` in PDF generation.
- `dompurify` in AI-rendered markdown sanitization.
- `react-router-dom` in routing.
- `mermaid` in diagram rendering.

### Impact

The highest-risk issues were critical/high vulnerabilities in PDF parsing and PDF generation. Those are directly relevant because users upload untrusted PDFs and the app renders/generated documents for users.

### Fix Applied

Ran the safe npm audit fix path, then applied the required breaking dependency bumps:

- `jspdf` upgraded to `^4.2.1`.
- `pdfjs-dist` upgraded to `^5.7.284`.
- `mermaid` upgraded to `^11.14.0`.
- `dompurify` remains on patched `^3.4.2`.
- `react-router-dom` upgraded to `^7.14.2`.
- `uuid` upgraded to `^14.0.0`.

Added Dependabot coverage:

- `.github/dependabot.yml`
- Weekly npm dependency checks.
- Grouped npm security update PRs.
- Weekly GitHub Actions dependency checks.

### Residual Risk

`npm audit --omit=dev` still reports four moderate advisories for `uuid <14` through transitive dependencies:

- `mermaid`
- `svix`
- `resend`

Do not run `npm audit fix --force` for this state without review. npm proposes a breaking/downgrade path for Mermaid, which could regress diagram rendering. Track this through Dependabot and upstream `mermaid` / `resend` / `svix` releases.

### Acceptance Criteria

- Critical/high runtime advisories from `jspdf` and `pdfjs-dist` are gone.
- Build succeeds after dependency updates.
- Remaining audit findings are documented and limited to moderate transitive dependencies.
- Dependabot opens future dependency/security PRs automatically.

### Verification

Completed by user:

```bash
npm audit --omit=dev
npm run build
```

Build completed successfully. Vite emitted only a chunk-size warning, not a build failure.

---

## P1-7. Strip the OTP Leak from the Client

Status: Implemented locally.

### Issue

The original browser-owned reset flow logged reset codes and other sensitive runtime state through `console.*`. Even after P0-1/P0-2 moved OTP generation and verification server-side, the client codebase still had many diagnostic logs across auth, generators, Supabase initialization, and processing code.

### Impact

Browser console logs are visible in DevTools and can expose user emails, auth/session state, key metadata, prompts, generated content, or reset-code data during local or production use.

### Fix Applied

Updated `vite.config.ts` so production builds strip console and debugger statements:

```ts
esbuild: command === 'build'
  ? {
      drop: ['console', 'debugger'],
    }
  : undefined
```

This keeps local development logs intact while removing `console.*` and `debugger` from shipped bundles.

Removed stale OTP-specific logging from `api/send-code.ts`.

Verified reset-specific client files:

- `components/auth/ResetPassword.tsx` calls `request-reset-code` and `reset-password` Edge Functions.
- `components/auth/ResetPassword.tsx` does not generate or log OTPs.
- `lib/email.ts` no longer exists.
- `api/send-code.ts` no longer logs email/code values.

### Residual Guidance

Do not add production diagnostics with raw `console.*`. Use one of these instead:

- A small logger wrapper gated on `import.meta.env.DEV`.
- Sentry breadcrumbs/events for production diagnostics.
- Server-side Edge Function or worker logs that do not include secrets, OTPs, tokens, or full user content.

### Acceptance Criteria

- No reset OTP is generated in browser code.
- No reset OTP is logged in browser code.
- Production Vite builds strip all `console.*` and `debugger` statements.
- Development builds keep logs available for local debugging.

### Verification

Run:

```bash
npm run build
```

Then grep the generated bundle for sensitive console output patterns. Expected result: no production bundle console calls.

---

## P1-8. RLS Coverage Verification

Status: TODO. Documentation-only entry.

### Issue

There is no automated test proving every `public` table has RLS enabled or that cross-user reads/writes are blocked. Several tables also appear to have partial policy coverage, such as `SELECT`/`INSERT` policies without matching `UPDATE`/`DELETE` policies where the product may need those actions.

Tables called out for policy review:

- `conversations`
- `messages`
- `flashcards`
- `user_activity`
- `graph_nodes`
- `graph_edges`

### Impact

Missing `UPDATE`/`DELETE` policies can create silent product failures because RLS default-denies those actions. More seriously, any table created without `ENABLE ROW LEVEL SECURITY` is exposed according to its grants, and that regression is not currently caught automatically.

### Fix Plan

Add automated database tests using pgTAP or `supabase db test`:

- Loop over every table in `public`.
- Assert `pg_class.relrowsecurity = true`.
- Fail the test if any public table has RLS disabled.

Add cross-user access tests for high-risk tables:

- `jobs`
- `handbooks`
- `user_credits`

Test shape:

- Seed user A and user B.
- Authenticate as user A.
- Verify user A cannot read user B rows.
- Verify user A cannot update user B rows.
- Verify user A cannot delete user B rows.

Review and add explicit `UPDATE`/`DELETE` policies where product behavior requires them:

- `conversations`
- `messages`
- `flashcards`
- `user_activity`
- `graph_nodes`
- `graph_edges`

### Supabase DB Changes Required

Yes, after policy review:

- Add missing RLS policies only where user workflows require update/delete behavior.
- Do not add broad policies just to make tests pass.
- Keep service-role-only tables without public policies where intentional.

### Acceptance Criteria

- A database test fails if any `public` table has RLS disabled.
- Cross-user tests prove `jobs`, `handbooks`, and `user_credits` cannot be read, updated, or deleted by another user.
- Product-required update/delete flows have explicit policies.
- Service-role-only tables remain inaccessible to anon/authenticated clients.

### Verification

Run in CI once P1-3 is implemented:

```bash
supabase db test
```

Until CI exists, run the same test suite locally before applying RLS migrations.

---

## Supabase Deployment Runbook

Status: Reference.

Official Supabase docs:

- Local development and deployment: https://supabase.com/docs/guides/local-development/overview
- Edge Function secrets: https://supabase.com/docs/guides/functions/secrets

Use this runbook when deploying the database migrations, Edge Functions, and production function secrets.

### 1. Log in to Supabase CLI

```bash
supabase login
```

Or with `npx`:

```bash
npx supabase login
```

### 2. Link the Project

Current project ref:

```text
cfaphpoblppwlomrtzwh
```

Command:

```bash
supabase link --project-ref cfaphpoblppwlomrtzwh
```

### 3. Push Database Migrations

This applies local migrations from `supabase/migrations/` to the linked remote project:

```bash
supabase db push
```

### 4. Set Production Edge Function Secrets

Create a local file such as:

```text
supabase/functions/.env.production
```

Example keys:

```env
OPENROUTER_API_KEY=...
NVIDIA_API_KEY=...
OPENAI_API_KEY=...
GOOGLE_API_KEY=...
FAL_API_KEY=...
RESEND_API_KEY=...
WEB3FORMS_ACCESS_KEY=...
SENTRY_DSN=...
```

Never commit this file. Push all secrets from the file:

```bash
supabase secrets set --env-file supabase/functions/.env.production
```

Or set one secret directly:

```bash
supabase secrets set NVIDIA_API_KEY=your_key_here
```

List configured remote secrets:

```bash
supabase secrets list
```

Supabase secrets are available to Edge Functions immediately after setting them. Redeploying the function is not required only to change a secret value.

### 5. Deploy Edge Functions

Deploy the required functions:

```bash
supabase functions deploy request-reset-code
supabase functions deploy reset-password
supabase functions deploy embed
supabase functions deploy chat
supabase functions deploy create-job
```

Deploy optional provider functions only if production uses them:

```bash
supabase functions deploy image
supabase functions deploy tts
supabase functions deploy email
```

Keep JWT verification enabled by default. Only use `--no-verify-jwt` for true public webhook endpoints that implement their own signature verification.

Example:

```bash
supabase functions deploy stripe-webhook --no-verify-jwt
```

### 6. Serve Functions Locally

Serve all functions with a local env file:

```bash
supabase functions serve --env-file supabase/functions/.env.production
```

Serve one function:

```bash
supabase functions serve embed --env-file supabase/functions/.env.production
```

### Recommended Memento Deployment Order

```bash
supabase login
supabase link --project-ref cfaphpoblppwlomrtzwh
supabase db push
supabase secrets set --env-file supabase/functions/.env.production
supabase functions deploy request-reset-code
supabase functions deploy reset-password
supabase functions deploy embed
supabase functions deploy chat
supabase functions deploy create-job
```

Then deploy optional functions as needed:

```bash
supabase functions deploy image
supabase functions deploy tts
supabase functions deploy email
```

---

## Docker and GHCR Workflow Notes

Status: Implemented on `main` and `memento-docker` branches.

### What Changed

The Docker publishing workflow moved away from Docker Hub and now publishes the frontend image to GitHub Container Registry.

Current image:

```text
ghcr.io/lunartech-x/memento
```

Current branch trigger:

```yaml
on:
  push:
    branches:
      - main
      - memento-docker
  workflow_dispatch:
```

This is intentionally branch-scoped while GHCR migration is being tested. Before production release, switch the workflow trigger back to tag-only releases.

### Registry Authentication

The workflow uses GitHub's built-in `GITHUB_TOKEN`:

```yaml
password: ${{ secrets.GITHUB_TOKEN }}
```

No Docker Hub credentials are required, and no GitHub PAT is required for publishing from this repository's workflow.

Required job permissions:

```yaml
permissions:
  contents: read
  packages: write
  id-token: write
```

### Build Inputs

The workflow uses the public Supabase URL directly:

```yaml
VITE_SUPABASE_URL: https://cfaphpoblppwlomrtzwh.supabase.co
```

The anon key still comes from GitHub Actions secrets:

```yaml
VITE_SUPABASE_ANON_KEY=${{ secrets.VITE_SUPABASE_ANON_KEY }}
```

If the secret is a modern `sb_publishable_...` key, the live Edge Function smoke test is skipped because JWT-verified Edge Functions require a JWT-shaped legacy anon key for direct `Authorization: Bearer ...` calls.

### Smoke Test Behavior

The workflow builds and pushes the image once, then pulls the pushed GHCR image back for validation:

```yaml
docker pull ghcr.io/lunartech-x/memento:sha-${{ github.sha }}
```

The smoke script checks the pushed image for old production-breaking embedding paths:

- `localhost:5173`
- `/nvidia-api`

This ensures the production bundle does not still depend on Vite's local dev proxy.

### Local Pull and Run

Pull the latest image:

```bash
docker pull ghcr.io/lunartech-x/memento:latest
```

Run locally:

```bash
docker run --rm -p 8080:8080 ghcr.io/lunartech-x/memento:latest
```

Open:

```text
http://localhost:8080
```

Health check:

```bash
curl http://localhost:8080/healthz
```

If the GHCR package is private, log in first:

```bash
docker login ghcr.io
```

Use a GitHub token with `read:packages` for private-image pulls outside GitHub Actions.

### Attestation Caveat

GitHub build provenance attestation was removed from the workflow because the LUNARTECH-X organization cannot persist attestations with the current billing/repository visibility setup.

Re-enable `actions/attest-build-provenance` after either:

- Making the repository public.
- Upgrading the organization plan so private-repo attestations are available.

### Remaining TODO

- Switch workflow trigger from branch pushes to `v*` tags for real releases.
- Add Trivy image scanning.
- Add Syft SBOM generation.
- Add Cosign signing if desired.
- Pin GitHub Actions by SHA.
- Add a separate PR-check workflow that does not push images.

---

## Backlog

Add future PX items below using the same structure:

- Priority and title
- Status
- Area
- Affected files
- Issue
- Impact
- Fix plan
- Supabase DB changes required, if any
- Acceptance criteria
- Verification
