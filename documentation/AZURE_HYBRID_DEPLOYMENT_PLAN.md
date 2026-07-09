# Cloudflare R2 Hybrid Deployment Plan

## TL;DR

Your project is a **client-side React SPA** with no backend, currently running on localhost only. It uses **Supabase** for auth, database (PostgreSQL + pgvector), and file storage (documents). The biggest storage cost driver is **generated audio** — a 10-min podcast ≈ 10 MB, a 3-hour podcast ≈ 170 MB. At scale, audio storage + bandwidth become the dominant recurring storage cost.

Cloudflare R2 is the optimal choice for media assets because it has **$0 egress fees** — the single biggest cost driver for audio streaming. For everything else (hosting, auth, database), the Vercel + Supabase path is simpler and cheaper. The optimal strategy is a **hybrid**: Vercel for SPA hosting + Supabase for auth/database + **Cloudflare R2 for media assets** (audio, slides, images).

---

## Architecture Comparison: Three Deployment Options

### Option A: Vercel + Supabase Only

| Component | Service | Cost |
|-----------|---------|------|
| SPA Hosting | Vercel Pro | $20/mo |
| API Proxies | Vercel Serverless Functions | Included |
| Database + pgvector | Supabase Pro | $25/mo |
| Auth | Supabase Auth | Included |
| File Storage (docs + audio) | Supabase Storage | 100 GB included, then $0.021/GB |
| Bandwidth | Supabase | 250 GB included, then $0.09/GB |
| **Total base** | | **$45/mo** |

**At 500 GB audio stored + 500 GB/mo bandwidth:**
$45 + (400 × $0.021) + (250 × $0.09) = $45 + $8.40 + $22.50 = **$75.90/mo**

**At 2 TB audio stored + 2 TB/mo bandwidth:**
$45 + (1900 × $0.021) + (1750 × $0.09) = $45 + $39.90 + $157.50 = **$242.40/mo**

---

### Option B: Full Azure (Containerized)

Not recommended. You'd lose Supabase's included storage + bandwidth, AND need to rebuild auth, RLS, realtime subscriptions, and pgvector RPC functions. The operational cost of managing PostgreSQL on Azure makes this worse overall.

---

### Option C: Hybrid — Vercel + Supabase + Cloudflare R2 (RECOMMENDED)

| Component | Service | Cost |
|-----------|---------|------|
| SPA Hosting | Vercel Pro | $20/mo |
| API Proxies | Vercel Serverless Functions | Included |
| Database + pgvector | Supabase Pro | $25/mo |
| Auth | Supabase Auth | Included |
| Document Storage | Supabase Storage (small files, PDFs) | Included in 100 GB |
| **Audio + Media Storage** | **Cloudflare R2** | $0.015/GB standard, $0.010/GB IA |
| **Audio CDN** | **Cloudflare CDN (built-in to R2)** | **$0 egress** |
| PDF Service | Vercel Serverless / Container | Free tier |
| **Total base** | | **$45/mo** |

**At 500 GB audio (300 standard / 200 IA) + 500 GB/mo audio bandwidth:**
$45 + (300 × $0.015) + (200 × $0.010) + (500 × $0.00) = $45 + $4.50 + $2.00 + $0 = **$51.50/mo**

**At 2 TB audio (500 standard / 1500 IA) + 2 TB/mo audio bandwidth:**
$45 + (500 × $0.015) + (1500 × $0.010) + (2000 × $0.00) = $45 + $7.50 + $15.00 + $0 = **$67.50/mo**

**At 5 TB audio (1 TB standard / 4 TB IA) + 3 TB/mo bandwidth:**
$45 + (1000 × $0.015) + (4000 × $0.010) + (3000 × $0.00) = $45 + $15 + $40 + $0 = **$100/mo**
vs Option A: $45 + (4900 × $0.021) + (2750 × $0.09) = **$395/mo** (75% more expensive)

---

## Cost Comparison Summary Table

| Scale | Option A (Vercel+Supa) | Option C (R2 Hybrid) | Savings |
|-------|------------------------|----------------------|---------|
| Launch (< 100 GB) | **$45** | **$46** | — |
| 500 GB storage | $75.90 | **$51.50** | -32% |
| 2 TB storage | $242.40 | **$67.50** | -72% |
| 5 TB storage | $395.00 | **$100.00** | -75% |

**R2's $0 egress is the game-changer.** At 2 TB/mo bandwidth, Supabase charges ~$157/mo in egress alone. R2 charges $0.

---

## Implementation Steps (Option C — R2 Hybrid)

### Step 1: Deploy SPA to Vercel

1. Fix hardcoded localhost URL in `lib/nvidiaEmbeddings.ts`
2. Create `vercel.json` with SPA rewrites and serverless function config
3. Create 3 serverless proxy functions under `api/`: `nvidia-proxy.ts`, `semantic-scholar.ts`, `openalex.ts`
4. Configure all environment variables in Vercel dashboard
5. Connect GitHub repo → auto-deploy on push

### Step 2: Set Up Cloudflare R2 for Media

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com) → R2 Object Storage
2. Create bucket: `memento-media`
3. Enable **public access** or configure a custom domain (e.g. `media.memento.ai`) via Cloudflare DNS
4. Configure **Lifecycle Rules**:
   - Audio files older than 30 days → move to **Infrequent Access** ($0.010/GB)
   - Temp/draft files older than 7 days → delete
5. Note your **Account ID**, then create an **R2 API Token** with `Object Read & Write` permissions

### Step 3: Create R2 Upload Proxy (Vercel Serverless Function)

Create `api/upload-media.ts` — a serverless function that receives media from the worker/client, uploads to R2, and returns the CDN URL. Uses the S3-compatible API (no Azure SDK needed):

```typescript
// api/upload-media.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export default async function handler(req, res) {
  const buffer = Buffer.from(await req.arrayBuffer());
  const key = `audio/${Date.now()}-${req.headers['x-filename']}`;

  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: req.headers['content-type'] || 'audio/mpeg',
  }));

  res.status(200).json({ url: `https://${process.env.R2_PUBLIC_DOMAIN}/${key}` });
}
```

### Step 4: Modify Audio and Video Generators

In `lib/audioGenerator.ts` and `lib/agents/videoMasterAgent.ts`:
- Replace `supabase.storage.from('assets').upload(...)` with a call to `/api/upload-media`
- Store the returned R2 CDN URL in `generated_assets.media_url`

### Step 5: Configure Environment Variables

**Vercel dashboard (server-side only — never `VITE_*`):**

| Variable | Purpose |
|----------|---------|
| `CF_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET_NAME` | Bucket name (e.g. `memento-media`) |
| `R2_PUBLIC_DOMAIN` | Public URL (e.g. `media.memento.ai`) |

---

## Why R2 Saves Money on Audio

1. **$0 egress** — Supabase and Azure charge $0.06–0.09/GB for bandwidth. R2 charges nothing. Audio streaming is bandwidth-heavy; this is the #1 cost driver.

2. **Built-in Cloudflare CDN** — No separate CDN product to configure or pay for. R2 objects are served from Cloudflare's global edge network automatically.

3. **S3-compatible API** — Uses `@aws-sdk/client-s3` with just an endpoint change. No Azure-specific SDK. If you ever migrate to AWS S3, the code is nearly identical.

4. **Lifecycle tiering** — Audio older than 30 days auto-moves to Infrequent Access ($0.010/GB). Old podcasts nobody listens to cost 33% less automatically.

5. **Generous free tier** — 10 GB storage + 10M reads/month free forever. Launch phase costs nothing for storage.

---

## What NOT to Move to R2

| Keep on Supabase | Reason |
|------------------|--------|
| Auth (email, Google, GitHub) | Supabase Auth is working and integrated everywhere |
| PostgreSQL + pgvector | RLS policies, RPC functions, realtime subscriptions are Supabase-specific |
| Document storage (`documents` bucket) | PDFs are small (1–20 MB), low volume — not worth the complexity |
| Edge Functions | `embed`, `chat`, `create-job` work on Supabase — no reason to move |

---

## Verification Checklist

1. **Storage cost**: Monitor R2 metrics dashboard — verify lifecycle rules are tiering audio correctly after 30 days
2. **Audio playback**: Test that R2 CDN URLs work in the audio player (verify CORS is configured on the bucket)
3. **Upload latency**: Compare Supabase upload time vs R2 upload — should be <2s for typical 10 MB podcast
4. **End-to-end**: Generate a full podcast → verify script → TTS → R2 upload → CDN URL saved to `generated_assets` → playback works

---

## Decisions Summary

- **R2 over Azure/AWS**: $0 egress eliminates the #1 storage cost driver. S3-compatible API means minimal code changes.
- **Vercel over Azure Static Web Apps**: Better DX, GitHub integration, preview deploys, zero-config serverless functions.
- **Supabase stays for DB/auth**: RLS, pgvector, realtime, and Edge Functions are deeply integrated — not worth migrating.
- **Server-side upload proxy**: Keeps R2 credentials off the client, aligns with the P0-3 security fix (remove all `VITE_*` API keys).
