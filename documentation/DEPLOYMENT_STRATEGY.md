# Deployment Strategy: Hosting `app.memento.ai`

> **Goal:** Deploy Memento as a secure, scalable production application at `app.memento.ai`

---

## Current Architecture Summary

Memento is a **Vite React SPA** that produces a static `dist/` bundle. It has **no custom backend server** — persistence and auth go through **Supabase** (managed PostgreSQL), with file storage via **Supabase Storage** and optional external object storage (**Azure Blob** or **AWS S3**) for larger assets. AI features call external APIs (OpenRouter, OpenAI, NVIDIA NIM, fal.ai) directly from the browser.

### Key Constraints Identified

| Constraint               | Detail                                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Static SPA**           | `npm run build` → `dist/` folder, deployable to any static host                                                |
| **CORS Proxies**         | 3 dev-only Vite proxies (`/nvidia-api`, `/semantic-scholar-api`, `/openalex-api`) that **break in production** |
| **Client-side API keys** | 9 `VITE_*` keys baked into JS at build time — **visible in browser DevTools**                                  |
| **No SSR**               | Pure client-side rendering, no server-side rendering needed                                                    |
| **Supabase as backend**  | Auth, DB, storage, realtime — all managed by Supabase                                                          |

---

## Platform Comparison

| Criteria                   | **Vercel** ✅ Recommended   | **Cloudflare Pages**            | **AWS (S3 + CloudFront)** |
| -------------------------- | --------------------------- | ------------------------------- | ------------------------- |
| **Static SPA hosting**     | ✅ Native Vite support      | ✅ Native                       | ✅ Via S3 + CloudFront    |
| **Serverless functions**   | ✅ Built-in (`/api/*`)      | ✅ Workers                      | ⚠️ Requires Lambda setup  |
| **Custom domain + SSL**    | ✅ Automatic Let's Encrypt  | ✅ Automatic                    | ⚠️ ACM + manual config    |
| **CORS proxy replacement** | ✅ Easy via `/api/` routes  | ✅ Via Workers                  | ⚠️ API Gateway needed     |
| **Environment variables**  | ✅ Dashboard UI, encrypted  | ✅ Wrangler CLI                 | ⚠️ SSM Parameter Store    |
| **Preview deployments**    | ✅ Per-branch automatic     | ✅ Per-branch                   | ❌ Manual                 |
| **Pricing (starter)**      | Free tier (100GB bandwidth) | Free tier (unlimited bandwidth) | Pay-per-use (~$5-20/mo)   |
| **Git integration**        | ✅ GitHub auto-deploy       | ✅ GitHub auto-deploy           | ⚠️ CodePipeline setup     |
| **Complexity**             | 🟢 Low                      | 🟢 Low                          | 🔴 High                   |
| **Global CDN**             | ✅ Edge Network             | ✅ 330+ PoPs                    | ✅ CloudFront             |

> [!IMPORTANT]
> **Recommendation: Vercel** — Best fit for Memento's React/Vite stack. Zero-config SPA deployment, built-in serverless functions to solve the CORS proxy problem, automatic SSL, and seamless GitHub integration. Vercel is purpose-built for exactly this type of frontend application.

---

## Recommended Production Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    app.memento.ai                             │
│                    (Vercel Edge Network)                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  STATIC ASSETS (Vercel CDN)                                  │
│  ├── dist/index.html              (SPA entry point)          │
│  ├── dist/assets/*.js             (React bundle)             │
│  └── dist/assets/*.css            (Tailwind styles)          │
│                                                               │
│  SERVERLESS FUNCTIONS (Vercel /api/*)                        │
│  ├── /api/nvidia-proxy            → integrate.api.nvidia.com │
│  ├── /api/semantic-scholar-proxy  → api.semanticscholar.org  │
│  ├── /api/openalex-proxy          → api.openalex.org         │
│  └── (future: /api/stripe-webhook)                           │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  EXTERNAL SERVICES (unchanged)                               │
│  ├── Supabase        PostgreSQL, Auth, Storage, Realtime     │
│  ├── OpenRouter      LLM gateway (Grok, Nemotron)            │
│  ├── OpenAI          Safety, KG extraction, TTS, Images      │
│  ├── NVIDIA NIM      BGE-M3 Embeddings (via proxy)           │
│  ├── fal.ai          FLUX image generation                   │
│  └── Web3Forms       Password reset emails                   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Critical Issue #1: CORS Proxy Replacement

The three Vite dev proxies **will not work in production**. The code currently calls `/nvidia-api/v1/embeddings` which Vite forwards to `integrate.api.nvidia.com` — but a static host like Vercel doesn't do this.

### Solution: Vercel Serverless API Routes

Create lightweight proxy functions under `/api/` that forward requests:

#### [NEW] `api/nvidia-proxy.ts`

```typescript
// Vercel Serverless Function
export default async function handler(req, res) {
  const targetUrl = `https://integrate.api.nvidia.com${req.url.replace("/api/nvidia-proxy", "")}`;
  const response = await fetch(targetUrl, {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers["authorization"],
    },
    body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
  });
  const data = await response.json();
  res.status(response.status).json(data);
}
```

#### [NEW] `api/semantic-scholar-proxy.ts` and `api/openalex-proxy.ts`

Same pattern — simple HTTP forwarders.

#### [MODIFY] Frontend code references

Update Vite proxy paths in the codebase:

| Current (dev only)          | Production equivalent             |
| --------------------------- | --------------------------------- |
| `/nvidia-api/v1/embeddings` | `/api/nvidia-proxy/v1/embeddings` |
| `/semantic-scholar-api/...` | `/api/semantic-scholar-proxy/...` |
| `/openalex-api/...`         | `/api/openalex-proxy/...`         |

> [!TIP]
> Use an environment variable `VITE_API_BASE` to toggle between dev proxy paths and production `/api/` paths, so both dev and prod work without code changes.

---

## Critical Issue #2: API Key Security

### Current Problem

All API keys are `VITE_*` prefixed, meaning Vite bakes them into the client-side JavaScript bundle. **Anyone can open DevTools and extract every API key** — OpenAI, OpenRouter, NVIDIA, fal.ai, etc.

### Risk Assessment

| Key                       | Risk if Exposed                                                | Urgency   |
| ------------------------- | -------------------------------------------------------------- | --------- |
| `VITE_OPENAI_API_KEY`     | 🔴 **Critical** — unbounded billing, can generate images/audio | Immediate |
| `VITE_OPENROUTER_API_KEY` | 🔴 **Critical** — unbounded LLM usage                          | Immediate |
| `VITE_NVIDIA_API_KEY`     | 🟡 **Medium** — embedding API abuse                            | Phase 2   |
| `VITE_FAL_API_KEY`        | 🟡 **Medium** — image generation abuse                         | Phase 2   |
| `VITE_SUPABASE_ANON_KEY`  | 🟢 **Low** — designed for client-side, protected by RLS        | OK as-is  |
| `VITE_WEB3FORMS_KEY`      | 🟢 **Low** — limited to email sending                          | OK as-is  |

### Solution: Move sensitive keys to serverless functions

**Phase 2 enhancement:** Route expensive API calls (OpenAI, OpenRouter, NVIDIA) through Vercel serverless functions that hold the API keys server-side. The client never sees the keys.

```
BEFORE (insecure):
  Browser JS → OpenAI API (key in JS bundle)

AFTER (secure):
  Browser JS → /api/openai-proxy → OpenAI API (key in Vercel env vars)
```

> [!WARNING]
> For the initial launch, the client-side API keys work fine if the app is behind authentication (Supabase Auth). However, **before scaling to paying users**, all expensive API keys must be moved server-side. This is a **Phase 2** priority.

---

## DNS & SSL Configuration

### Domain Setup

| Record           | Type  | Value                   | Purpose                                |
| ---------------- | ----- | ----------------------- | -------------------------------------- |
| `app.memento.ai` | CNAME | `cname.vercel-dns.com`  | Points to Vercel                       |
| `memento.ai`     | A     | Vercel IP (or redirect) | Root domain → landing page or redirect |

### Steps

1. **In your domain registrar** (e.g., Namecheap, Cloudflare DNS):
   - Add a CNAME record: `app` → `cname.vercel-dns.com`
2. **In Vercel Dashboard** → Project Settings → Domains:
   - Add `app.memento.ai`
   - Vercel auto-provisions a Let's Encrypt SSL certificate (HTTPS)
3. SSL is **automatic and free** — no manual certificate management

---

## Deployment Workflow

### Automatic CI/CD via Vercel + GitHub

```
Developer pushes to Seryozha branch
         │
         ▼
GitHub webhook → Vercel
         │
         ├── npm install
         ├── npm run build (with env vars injected)
         ├── Deploy dist/ to Vercel CDN
         └── Assign preview URL: https://memento-xyz.vercel.app

Merge to main branch
         │
         ▼
Vercel auto-deploys to production
         └── Live at https://app.memento.ai
```

### Environment Variables in Vercel

Set these in **Vercel Dashboard → Project Settings → Environment Variables**:

| Variable                  | Scope               |
| ------------------------- | ------------------- |
| `VITE_SUPABASE_URL`       | Production, Preview |
| `VITE_SUPABASE_ANON_KEY`  | Production, Preview |
| `VITE_OPENROUTER_API_KEY` | Production, Preview |
| `VITE_NVIDIA_API_KEY`     | Production, Preview |
| `VITE_OPENAI_API_KEY`     | Production, Preview |
| `VITE_FAL_API_KEY`        | Production, Preview |
| `VITE_WEB3FORMS_KEY`      | Production, Preview |

> [!NOTE]
> Vercel encrypts environment variables at rest and injects them at build time (same as `.env.local` but secure in the dashboard).

---

## Supabase Production Configuration

Supabase is already a managed service, but ensure these production settings:

| Setting                | Action                                                                         |
| ---------------------- | ------------------------------------------------------------------------------ |
| **Project Region**     | Choose closest to primary users (e.g., `us-east-1` for US, `eu-west-1` for EU) |
| **Connection Pooler**  | Enable PgBouncer for connection pooling                                        |
| **RLS**                | Verify all tables have RLS enabled (already done)                              |
| **Auth Redirect URLs** | Add `https://app.memento.ai/auth/callback` to allowed redirect URLs            |
| **CORS Origins**       | Add `https://app.memento.ai` to allowed origins                                |
| **Rate Limiting**      | Configure auth rate limits to prevent abuse                                    |
| **Backups**            | Enable Point-in-Time Recovery (Pro plan)                                       |
| **Storage Policies**   | Verify bucket RLS policies restrict access per user                            |

---

## Scalability Considerations

| Concern                | Solution                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| **Static assets**      | Vercel CDN serves globally with edge caching — scales automatically                                   |
| **Database**           | Supabase Pro plan supports up to 500 concurrent connections; upgrade to Team/Enterprise as needed     |
| **API rate limits**    | OpenRouter/OpenAI/NVIDIA have per-key rate limits — monitor usage, request limit increases            |
| **Large file uploads** | Supabase Storage handles up to 5GB per file; use Cloudflare R2 for audio/media assets ($0 egress, built-in CDN) |
| **Concurrent users**   | SPA + Supabase Realtime can handle thousands of concurrent users; the bottleneck is AI API throughput |
| **Cost scaling**       | Primary cost drivers: OpenAI TTS (~$15/1M chars), OpenRouter LLM calls, and object storage/egress      |

---

## Phased Rollout Plan

### Phase 1: Initial Production Deployment (1-2 days)

- [ ] Create Vercel project, connect GitHub repo
- [ ] Configure `app.memento.ai` DNS (CNAME → Vercel)
- [ ] Set environment variables in Vercel dashboard
- [ ] Create `/api/nvidia-proxy.ts`, `/api/semantic-scholar-proxy.ts`, `/api/openalex-proxy.ts` serverless functions
- [ ] Update frontend proxy paths for production
- [ ] Configure Supabase Auth redirect URL and CORS origins
- [ ] Deploy and verify all features work

### Phase 2: Security Hardening (1 week)

- [ ] Move OpenAI, OpenRouter, NVIDIA API keys to server-side proxy functions
- [ ] Add rate limiting to proxy functions (per-user, per-minute)
- [ ] Enable Supabase Pro plan for backups and better performance
- [ ] Set up error monitoring (Sentry or similar)
- [ ] Implement API usage logging for cost tracking

### Phase 3: Scalability & Monitoring (ongoing)

- [ ] Set up Vercel Analytics for performance monitoring
- [ ] Configure Supabase alerts for database size/connection limits
- [ ] Implement credit system (from February Release plan) to control AI API spend
- [ ] Add health check endpoint
- [ ] Set up uptime monitoring (e.g., Better Uptime)

---

## Verification Plan

### Automated Checks

- `npm run build` completes without errors
- All 3 proxy API routes respond correctly
- Supabase connection works from production domain
- SSL certificate is valid and auto-renewing

### Manual Verification

- Sign up / sign in flow works at `https://app.memento.ai`
- Upload a PDF → processing completes → chunks and KG created
- RAG chat returns relevant, cited answers
- Audio, quiz, flashcard, mind map, handbook generation all work
- PDF export produces valid documents
- Deep Search returns results from all providers

---

## Cost Estimate (Monthly)

| Service        | Tier                    | Est. Cost        | Notes                                  |
| -------------- | ----------------------- | ---------------- | -------------------------------------- |
| **Vercel**     | Pro                     | $20/mo           | 1TB bandwidth, serverless functions    |
| **Supabase**   | Pro                     | $25/mo           | 8GB DB, 250GB storage, 500 connections |
| **Cloudflare R2** | Pay-per-use          | $0-15/mo         | Recommended for large audio/media files — $0 egress |
| **OpenRouter** | Pay-per-use             | $30-100/mo       | Depends on chat/generation volume      |
| **OpenAI**     | Pay-per-use             | $50-200/mo       | TTS + safety + KG extraction           |
| **NVIDIA NIM** | Free tier / Pay-per-use | $0-50/mo         | Embedding generation                   |
| **fal.ai**     | Pay-per-use             | $10-30/mo        | Image generation                       |
| **Domain**     | Annual                  | ~$12/yr          | `memento.ai` renewal                   |
| **Total**      |                         | **~$155-510/mo** | Scales with user count and storage/egress mix |
