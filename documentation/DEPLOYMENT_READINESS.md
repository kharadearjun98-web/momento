# Memento — Deployment Readiness Checklist

> **Status:** 🔴 NOT READY FOR DEPLOYMENT
>
> This document enumerates every critical, high, medium, and nice‑to‑have item discovered during the DevOps/security audit of the Memento codebase. Items are ordered by severity. **Every P0 item is a hard blocker for a public deployment.**
>
> Last audit: 2026‑04‑16 · Branch: `jim-memento`

---

## Legend

| Severity | Meaning |
|----------|---------|
| 🔴 **P0** | Critical / exploitable. Blocks deployment. |
| 🟠 **P1** | High. Must be fixed before external users are onboarded. |
| 🟡 **P2** | Medium. Hardening items for the first sprint post‑launch. |
| 🟢 **P3** | Nice‑to‑have / long‑term improvement. |

---

## 🔴 P0 — Critical Blockers

### P0‑1. Unauthenticated account takeover via `reset_user_password` RPC
- **File:** `supabase/reset_password_function.sql`
- **Issue:** The function is `SECURITY DEFINER`, updates `auth.users.encrypted_password`, and is `GRANT EXECUTE ... TO anon`. No verification that the caller owns the email or supplied a valid OTP.
- **Exploit:** Anyone with the public anon key (embedded in the JS bundle) can reset any user's password via a single `supabase.rpc(...)` call.
- **Fix:**
  - [ ] Drop the `reset_user_password` function, or restrict it to the service role only.
  - [ ] Create a Supabase Edge Function that (a) verifies the OTP against `password_reset_codes` server‑side, (b) uses `supabase.auth.admin.updateUserById(...)` via the service role key, (c) marks the code used atomically.
  - [ ] Update `components/auth/ResetPassword.tsx` to call the Edge Function instead of the RPC.

### P0‑2. Password‑reset codes world‑readable
- **File:** `supabase/password_reset_codes_table.sql`
- **Issue:** RLS policies allow `anon` and `authenticated` to `SELECT`, `INSERT`, and `UPDATE` every row. Codes are 6‑digit numeric and only marked `used` after successful verification.
- **Exploit:** Anyone can `select * from password_reset_codes` and read live OTPs for all users.
- **Fix:**
  - [ ] Drop all permissive `anon`/`authenticated` policies on `password_reset_codes`.
  - [ ] Access the table exclusively from the Edge Function via the service role key.
  - [ ] Add a rate limit (e.g. 5 codes per email per 15 min) and attempt counter to defeat brute force.
  - [ ] Move OTP generation server‑side (don't generate in the browser).

### P0‑3. Third‑party API keys shipped inside the browser bundle
- **Files:** `Dockerfile`, `.github/workflows/docker.yml`, `vite.config.ts`, all `lib/*Generator.ts`, `lib/aiChat.ts`, `lib/nvidiaEmbeddings.ts`, `lib/email.ts`
- **Issue:** `VITE_OPENAI_API_KEY`, `VITE_NVIDIA_API_KEY`, `VITE_OPENROUTER_API_KEY`, `VITE_GOOGLE_API_KEY`, `VITE_WEB3FORMS_KEY`, `VITE_FAL_API_KEY` are inlined at build time and also baked into the Docker image that gets pushed to the **public** `docker.io/jimamuto/memento:latest`. Every OpenAI SDK client is instantiated with `dangerouslyAllowBrowser: true`.
- **Exploit:** Any visitor extracts the keys from DevTools and can drain your LLM/TTS/embedding budgets. Any Docker Hub user can `docker pull` and grep layers for the keys.
- **Fix:**
  - [ ] **Rotate every key listed above today.**
  - [ ] Make the Docker Hub repository private (or switch to GHCR with OIDC) and purge old tags.
  - [ ] Create Supabase Edge Functions for: chat completions (OpenRouter), embeddings (NVIDIA), image generation (FAL/Flux), TTS (Google/OpenAI), email (Web3Forms/Resend).
  - [ ] Store keys in Supabase `Deno.env` / secret manager — never `VITE_*`.
  - [ ] Remove every `dangerouslyAllowBrowser: true` occurrence (23 hits across the codebase).
  - [ ] Delete all `VITE_*_API_KEY` build args from `Dockerfile` and `.github/workflows/docker.yml`.
  - [ ] Keep only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` on the client (these are public by design).

### P0‑4. Stored XSS via AI‑rendered markdown
- **File:** `lib/markdownRenderer.ts` (used via `dangerouslySetInnerHTML` in `HandbookPlayback`, `ReportPlayback`, `VisualSlidePlayback`, `QuizPlayback`, `FlashcardsPlayback`, `VideoOverviewPlayback`, `MermaidDiagram`).
- **Issue:** DOMPurify is configured with `ADD_ATTR: ['onclick', 'onmouseover', 'onmouseout', ...]` and `FORBID_TAGS: [], FORBID_ATTR: []`. KaTeX is rendered with `trust: true`. Content flows from attacker‑controlled PDF uploads into the AI pipeline and back out into the DOM.
- **Exploit:** An attacker uploads a PDF that, when summarised/echoed by the AI, contains HTML with inline event handlers → arbitrary JS runs in the victim's authenticated session.
- **Fix:**
  - [ ] Remove `onclick`, `onmouseover`, `onmouseout` from `ADD_ATTR`.
  - [ ] Replace the citation span's inline `onclick` with a single delegated click listener reading `data-citation`.
  - [ ] Set KaTeX options to `trust: false, strict: 'warn'`.
  - [ ] Add a Content‑Security‑Policy header (see P1‑4) that blocks inline event handlers in depth.
  - [ ] Upgrade DOMPurify (see P1‑6).

### P0‑5. Production build is broken for NVIDIA embeddings
- **File:** `lib/nvidiaEmbeddings.ts`
- **Issue:** `NVIDIA_BASE_URL = 'http://localhost:5173/nvidia-api/v1'` is hardcoded. Works only under `vite dev`. In the nginx image there is no `/nvidia-api/` proxy, so every embedding call (= all PDF ingestion, all search) will 404 in production.
- **Fix:**
  - [ ] Move the call behind a Supabase Edge Function (preferred — matches P0‑3).
  - [ ] Replace the URL with a relative path.
  - [ ] Add an integration test that hits embeddings in the built image before we promote to prod.

---

## 🟠 P1 — High Severity

### P1‑1. `assets` storage bucket is public and world‑writable to any authenticated user
- **File:** `supabase/setup-storage-assets.sql`
- **Issue:** `UPDATE` and `DELETE` policies only check `bucket_id = 'assets'` — no ownership check. Any logged‑in user can overwrite/delete another user's podcasts and videos. Bucket is also `public = true`.
- **Fix:**
  - [ ] Scope policies with `owner = auth.uid()` or a `notebook_id` path prefix join.
  - [ ] Consider making the bucket private and serving content via signed URLs.

### P1‑2. Conflicting / duplicate Supabase schema files
- **Files:** `supabase/setup-database.sql`, `supabase/schema_safe.sql`, `supabase/migrate-to-1024-dimensions.sql`, `supabase/lightrag-functions.sql`, `supabase/fix-generated-assets-timeout.sql`
- **Issue:** `document_chunks.embedding` is defined as `vector(1536)` in two files and `vector(1024)` in the migration. `notebooks.user_id` references `auth.users(id)` in one file and `profiles(id)` in another. Running them in the wrong order on a fresh project leaves inconsistent types, missing FKs, and broken RLS.
- **Fix:**
  - [ ] Consolidate into a timestamp‑ordered `supabase/migrations/` directory.
  - [ ] Apply via `supabase db push` from CI against a clean database as part of the deploy pipeline.
  - [ ] Add migration tests (pgTAP or `supabase db test`).

### P1‑3. CI/CD pipeline has no security gates
- **File:** `.github/workflows/docker.yml`
- **Issues:**
  - Triggers on a feature branch (`jim-memento`) and tags `latest` — release pipeline should be tag‑driven.
  - No `npm audit`, no Snyk/Socket, no container scan (Trivy/Grype), no SBOM.
  - No linting, no type‑check, no tests.
  - No image signing (cosign) or SLSA provenance attestation.
  - Long‑lived `DOCKERHUB_TOKEN` PAT instead of OIDC federation.
  - Secrets baked into image layers (see P0‑3).
- **Fix:**
  - [ ] Add jobs: `typecheck`, `lint`, `test`, `npm audit --omit=dev --audit-level=high`, `trivy image`, `cosign sign`, `syft sbom`.
  - [ ] Switch to tag‑triggered release workflow (`push.tags: ['v*']`), keep a separate PR‑check workflow.
  - [ ] Migrate registry auth to GitHub OIDC (GHCR) or AWS/GCP OIDC if moving cloud registries.
  - [ ] Pin `actions/*` by SHA, set `permissions: { contents: read, packages: write, id-token: write }` explicitly per job.

### P1‑4. nginx is missing all security headers and hardening
- **File:** `nginx.conf`
- **Missing:** CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `server_tokens off`, health endpoint, non‑root user, `HEALTHCHECK`.
- **Fix:**
  - [ ] Add headers:
    ```
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    server_tokens off;
    ```
  - [ ] Add `location = /healthz { access_log off; return 200; }`.
  - [ ] Run container as non‑root (`USER nginx`), drop Linux capabilities.
  - [ ] Add `HEALTHCHECK` to `Dockerfile`.
  - [ ] Pin base images by digest (`node:20.18-alpine@sha256:…`, `nginx:1.27-alpine@sha256:…`).

### P1‑5. PDF.js worker loaded from third‑party CDN
- **File:** `lib/documentProcessor.ts`
- **Issue:** `pdfjsLib.GlobalWorkerOptions.workerSrc = '//cdnjs.cloudflare.com/ajax/libs/pdf.js/...'` — supply‑chain risk and it breaks a strict CSP.
- **Fix:**
  - [ ] Bundle the worker locally: `import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url'`.

### P1‑6. Vulnerable dependencies (1 critical, 7 high, 9 moderate)
Run: `npm audit --omit=dev`
- **Critical:** `jspdf` — path traversal, arbitrary JS execution in generated PDFs, DoS.
- **High:** `pdfjs-dist@3.11.174` — arbitrary JS on opening malicious PDF (direct RCE‑in‑browser path since we parse untrusted uploads).
- **High:** `react-router-dom@7.9.6` — CSRF, open‑redirect XSS, SSR XSS.
- **High (transitive via mermaid):** `lodash-es` prototype pollution & code injection.
- **High:** `picomatch`, `minimatch`, `tar` — ReDoS / path traversal.
- **Moderate→effective high:** `dompurify@3.2.2` — mutation XSS, ADD_ATTR URI bypass, prototype pollution.
- **Fix:**
  - [ ] `npm audit fix` for safe bumps.
  - [ ] Breaking bumps: `pdfjs-dist` → 5.x, `jspdf` → 4.2.1+, `mermaid` → 12.x, `dompurify` → 3.3.4+, `react-router-dom` → 7.12+.
  - [ ] Add Dependabot / Renovate config.

### P1‑7. Reset‑password flow leaks OTP to the client console
- **Files:** `components/auth/ResetPassword.tsx`, `lib/email.ts`, `api/send-code.ts`
- **Issue:** The OTP is generated in the browser and `console.log`ged multiple times. Code also assumes a browser‑generated OTP written via the client — see P0‑2 for the combined impact.
- **Fix:** Done as part of P0‑1 / P0‑2. Additionally strip all `console.*` in production (see P2‑1).

### P1‑8. Supabase RLS coverage verification
- **Files:** `supabase/schema_safe.sql`
- **Issue:** Tables like `conversations`, `messages`, `flashcards`, `user_activity`, `graph_nodes`, `graph_edges` have SELECT/INSERT policies but are missing UPDATE/DELETE policies. The default deny of RLS will block those actions, which may hide silent failures; worse, any table missed from `ENABLE ROW LEVEL SECURITY` is fully exposed.
- **Fix:**
  - [ ] Write an automated test (pgTAP) that asserts RLS is enabled on every table in `public` and that an anon user cannot read/write cross‑user data.
  - [ ] Add the missing UPDATE/DELETE policies where the product needs them.

---

## 🟡 P2 — Medium Severity / Hardening

### P2‑1. Console noise in production
- 300+ `console.log` calls across `lib/` and `components/`, many logging tokens, user emails, key prefixes.
- **Fix:** In `vite.config.ts` add `esbuild: { drop: ['console', 'debugger'] }` for production builds, or use a logger wrapper gated on `import.meta.env.DEV`.

### P2‑2. Remove `AuthDebug.tsx` from production
- **File:** `components/AuthDebug.tsx`
- **Fix:** Gate behind `import.meta.env.DEV` or delete.

### P2‑3. No rate limiting
- Nothing throttles Supabase RPC calls, login, signup, or password reset.
- **Fix:** Put Cloudflare in front of the app with rate‑limit rules on `/auth/*`; enable Supabase's built‑in rate limits on the auth endpoints.

### P2‑4. Permissive CORS on Edge Function
- **File:** `supabase/functions/send-verification-code/index.ts` uses `Access-Control-Allow-Origin: *`.
- **Fix:** Restrict to the deployed origin only; echo the `Origin` header against an allow‑list.

### P2‑5. Dockerfile hardening
- **Fix:**
  - [ ] Pin base images by digest.
  - [ ] `USER nginx` in final stage.
  - [ ] Add `HEALTHCHECK CMD wget -qO- http://localhost/healthz || exit 1`.
  - [ ] Multi‑arch build (`linux/amd64,linux/arm64`) if the target host is ARM.
  - [ ] Set `NODE_ENV=production` during `npm ci` for the builder stage (after install) to reduce build output size.

### P2‑6. `vite.config.ts` — stop manually inlining secrets
- Remove all `define:` entries for `VITE_*_API_KEY` and `GEMINI_API_KEY`. Vite already exposes `VITE_*` automatically — the manual `define` block is currently being used to double‑inline secrets.

### P2‑7. Observability gap
- No Sentry, no log shipping, no uptime monitor, no error tracking.
- **Fix:**
  - [ ] Add Sentry (browser SDK) for the SPA; scrub PII.
  - [ ] Cloudflare/Pingdom/BetterStack probe on `/healthz`.
  - [ ] Pipe Supabase logs to a durable store (Logflare, Axiom, or Datadog).

### P2‑8. Backup & disaster‑recovery plan is not documented
- **Fix:**
  - [ ] Enable Supabase Point‑in‑Time Recovery.
  - [ ] Scheduled `pg_dump` to off‑site cold storage (S3 + lifecycle to Glacier).
  - [ ] Document RPO/RTO targets here and test restores quarterly.

### P2‑9. Branch protection & release process
- **Fix:**
  - [ ] Protect `main` (required PR reviews, required status checks, no force‑push).
  - [ ] Semantic tagging for releases; deploys trigger from tags, not branches.
  - [ ] CHANGELOG discipline.

### P2‑10. Audit all routes for `ProtectedRoute`
- **Files:** `App.tsx`, `pages/*`
- **Fix:** Confirm every authenticated page is wrapped in `ProtectedRoute`; add a test that navigates as anon and expects redirects.

---

## 🟢 P3 — Nice‑to‑have / Longer‑term

- [ ] Move to a monorepo structure (`apps/web`, `apps/edge`, `packages/shared`) as the Edge Function codebase grows.
- [ ] Add E2E tests (Playwright) covering auth, upload, generation, playback.
- [ ] Add bundle‑size budget to CI.
- [ ] Add accessibility (axe) automated checks.
- [ ] Terraform / Pulumi the Supabase project + Cloudflare zone + Docker host so environments are reproducible.
- [ ] Multi‑environment pipeline (`dev` → `staging` → `prod`) with separate Supabase projects.
- [ ] Blue/green deploys on the host (two nginx containers behind Caddy/Traefik) instead of the `stop && rm` pattern in `DEPLOYMENT.md`.
- [ ] Feature flags (e.g. PostHog, Unleash) so risky AI features can be toggled.
- [ ] Cost dashboards for LLM/TTS/embedding spend once keys are server‑side.

---

## Minimum Gating Checklist (the "can we go live?" list)

Every box below must be ticked before a public deployment.

### Security
- [ ] **P0‑1** `reset_user_password` RPC removed; reset flow moved to Edge Function w/ service‑role key.
- [ ] **P0‑2** `password_reset_codes` RLS locked down; OTPs generated + verified server‑side.
- [ ] **P0‑3** All `VITE_*_API_KEY` values rotated and removed from client + Docker image; LLM/TTS/embedding/email calls proxied through Edge Functions.
- [ ] **P0‑3** Docker Hub repo private (or moved to GHCR); old tags purged.
- [ ] **P0‑4** `onclick`/`onmouseover`/`onmouseout` removed from DOMPurify `ADD_ATTR`; KaTeX `trust: false`.
- [ ] **P1‑1** `assets` bucket policies scoped by owner.
- [ ] **P1‑6** `npm audit --audit-level=high` is clean.
- [ ] **P1‑8** RLS regression test passes for every `public.*` table.

### Deployment
- [ ] **P0‑5** NVIDIA embeddings work in the built Docker image (integration test in CI).
- [ ] **P1‑2** A single ordered `supabase/migrations/` directory is applied by CI against a clean database.
- [ ] **P1‑4** `nginx.conf` has CSP + HSTS + security headers and a `/healthz` endpoint.
- [ ] **P1‑5** PDF.js worker is bundled locally (no CDN dependency).
- [ ] **P2‑5** Dockerfile runs as non‑root, uses digest‑pinned bases, has a `HEALTHCHECK`.

### Pipeline
- [ ] **P1‑3** CI runs lint, typecheck, tests, `npm audit`, Trivy, SBOM, image signing.
- [ ] **P1‑3** Release workflow is tag‑triggered and uses OIDC for registry auth.
- [ ] **P2‑9** `main` branch is protected.

### Operations
- [ ] **P2‑7** Sentry wired up; uptime probe live; log shipping configured.
- [ ] **P2‑8** PITR enabled; restore procedure documented and tested.
- [ ] Runbook written for: key rotation, rollback, incident response, Supabase outage.

---

## Suggested Execution Order

1. **Hotfix PR (day 0):** Rotate keys, make Docker repo private, disable `reset_user_password`, tighten `password_reset_codes` RLS. This gets us out of "actively exploitable" status even before the full refactor lands.
2. **Security PR (week 1):** Edge Functions for chat/embeddings/TTS/image/email. Remove all `VITE_*_API_KEY` references. Fix DOMPurify. Fix NVIDIA URL.
3. **Infra PR (week 2):** Consolidate migrations, harden `nginx.conf`, harden `Dockerfile`, add CSP, bundle PDF.js worker, `npm audit fix` + breaking bumps.
4. **Pipeline PR (week 2):** Add CI security gates, switch to tag‑triggered release, OIDC to GHCR, image signing.
5. **Observability PR (week 3):** Sentry, uptime, log shipping, backup procedure, runbook.
6. **Go‑live dry run (week 3):** Deploy to a staging Supabase project + staging container; run full E2E; pen‑test the reset flow and the markdown renderer; sign off the gating checklist above.
7. **Production deploy (week 4).**

---

## Appendix — Files referenced in this audit

| Concern | Paths |
|---------|-------|
| Secrets in bundle | `Dockerfile`, `.github/workflows/docker.yml`, `vite.config.ts`, `lib/aiChat.ts`, `lib/nvidiaEmbeddings.ts`, `lib/email.ts`, every `lib/*Generator.ts` |
| Password reset | `supabase/reset_password_function.sql`, `supabase/password_reset_codes_table.sql`, `components/auth/ResetPassword.tsx`, `lib/email.ts`, `supabase/functions/send-verification-code/index.ts` |
| XSS surface | `lib/markdownRenderer.ts`, `components/HandbookPlayback.tsx`, `components/ReportPlayback.tsx`, `components/VisualSlidePlayback.tsx`, `components/QuizPlayback.tsx`, `components/FlashcardsPlayback.tsx`, `components/VideoOverviewPlayback.tsx`, `components/MermaidDiagram.tsx` |
| Schema drift | `supabase/setup-database.sql`, `supabase/schema_safe.sql`, `supabase/migrate-to-1024-dimensions.sql`, `supabase/setup-storage-assets.sql` |
| Web hardening | `nginx.conf`, `Dockerfile`, `lib/documentProcessor.ts` |
| CI/CD | `.github/workflows/docker.yml`, `DEPLOYMENT.md` |
