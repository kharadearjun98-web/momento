# Cloud Object Storage Comparison: Azure vs AWS vs Cloudflare R2

> **Context:** Memento generates audio podcasts (10 MB–170 MB per episode), slide images, and media assets that need scalable, cost-effective object storage with CDN delivery. This document compares the three leading options as the **media storage layer** in our hybrid architecture (Vercel + Supabase + Object Storage).

---

## TL;DR — Who Wins?

| Criteria                   |       Azure Blob        |          AWS S3          |      Cloudflare R2      |
| -------------------------- | :---------------------: | :----------------------: | :---------------------: |
| **Cheapest at scale**      |           ❌            |            ❌            |           ✅            |
| **Zero egress**            |           ❌            |            ❌            |           ✅            |
| **Best lifecycle tiering** |           ✅            |            ✅            |    ⚠️ (2 tiers only)    |
| **Easiest integration**    |           ⚠️            |            ⚠️            |           ✅            |
| **S3 API compatible**      |           ❌            |       ✅ (native)        |           ✅            |
| **Built-in CDN**           | ❌ (separate Azure CDN) | ❌ (separate CloudFront) | ✅ (Cloudflare network) |
| **Archive/deep-cold tier** |     ✅ ($0.002/GB)      |  ✅ ($0.004/GB Glacier)  |           ❌            |
| **Best for Memento**       |         🥉 3rd          |          🥈 2nd          |       🥇 **1st**        |

> **Recommendation: Cloudflare R2** — The $0 egress alone saves Memento **50–60%** at scale compared to Azure and AWS. Audio streaming is bandwidth-heavy, and egress is the #1 cost driver. R2 eliminates it entirely.

---

## 1. Storage Pricing (Per GB/Month)

### Standard / Hot Storage (frequently accessed)

| Provider          | Tier Name | Price         | Free Tier                 |
| ----------------- | --------- | ------------- | ------------------------- |
| **Azure Blob**    | Hot       | $0.018/GB     | None                      |
| **AWS S3**        | Standard  | $0.023/GB     | 5 GB (12 months)          |
| **Cloudflare R2** | Standard  | **$0.015/GB** | **10 GB/month** (forever) |

### Infrequent Access / Cool Storage

| Provider          | Tier Name         | Price         | Min Duration | Retrieval Fee |
| ----------------- | ----------------- | ------------- | :----------: | ------------- |
| **Azure Blob**    | Cool              | $0.010/GB     |   30 days    | $0.01/GB      |
| **AWS S3**        | S3-IA             | $0.0125/GB    |   30 days    | $0.01/GB      |
| **Cloudflare R2** | Infrequent Access | **$0.010/GB** |   30 days    | $0.01/GB      |

### Cold / Archive Storage (rarely accessed)

| Provider          | Tier Name            | Price       | Min Duration | Retrieval Fee | Retrieval Time |
| ----------------- | -------------------- | ----------- | :----------: | ------------- | :------------: |
| **Azure Blob**    | Cold                 | $0.0036/GB  |   90 days    | $0.02/GB      |    Instant     |
| **Azure Blob**    | Archive              | $0.002/GB   |   180 days   | $0.022/GB     |     Hours      |
| **AWS S3**        | Glacier Instant      | $0.004/GB   |   90 days    | $0.03/GB      |  Milliseconds  |
| **AWS S3**        | Glacier Flexible     | $0.0036/GB  |   90 days    | $0.03/GB      | Minutes–Hours  |
| **AWS S3**        | Glacier Deep Archive | $0.00099/GB |   180 days   | $0.02/GB      |   12+ Hours    |
| **Cloudflare R2** | ❌ No equivalent     | —           |      —       | —             |       —        |

> **Key difference:** Azure and AWS offer deep-cold archive tiers that R2 lacks. However, for Memento's use case (audio that may be re-listened), data needs to be instantly accessible — making cold/archive tiers impractical for audio anyway. These tiers are only useful for compliance backups.

---

## 2. Egress / Bandwidth Pricing ⚡ (The Game-Changer)

This is where R2 **dominates**. Audio streaming = high egress.

| Provider          | Egress Price            | Via CDN                     | Notes                                     |
| ----------------- | ----------------------- | --------------------------- | ----------------------------------------- |
| **Azure Blob**    | $0.087/GB (first 10 TB) | Azure CDN: ~$0.06–0.087/GB  | Separate CDN product, additional config   |
| **AWS S3**        | $0.09/GB (first 10 TB)  | CloudFront: ~$0.085/GB      | Separate CloudFront distribution required |
| **Cloudflare R2** | **$0.00/GB**            | **Built-in Cloudflare CDN** | Free. Forever. No separate CDN needed.    |

### Egress Cost at Scale

| Monthly Bandwidth | Azure (CDN) | AWS (CloudFront) |   R2   |
| :---------------: | :---------: | :--------------: | :----: |
|      100 GB       |    $6.00    |      $8.50       | **$0** |
|      500 GB       |   $30.00    |      $42.50      | **$0** |
|       1 TB        |   $60.00    |      $85.00      | **$0** |
|       2 TB        |   $120.00   |     $170.00      | **$0** |
|       5 TB        |   $300.00   |     $425.00      | **$0** |

> 🎯 **At 2 TB/month bandwidth, R2 saves $120–170/month on egress alone.** This is the single most impactful cost factor because Memento's audio streaming drives high, recurring egress.

---

## 3. API Operations Pricing

### Write/Mutate Operations (Class A: PUT, POST, LIST, CREATE)

| Provider                     | Price                          | Free Tier                     |
| ---------------------------- | ------------------------------ | ----------------------------- |
| **Azure Blob**               | $0.065/10K ops ($6.50/million) | None                          |
| **AWS S3**                   | $0.005/1K ops ($5.00/million)  | 2,000 free PUTs (12 months)   |
| **Cloudflare R2** (Standard) | $4.50/million                  | **1 million/month** (forever) |
| **Cloudflare R2** (IA)       | $9.00/million                  | **1 million/month** (forever) |

### Read Operations (Class B: GET, HEAD)

| Provider                     | Price                          | Free Tier                      |
| ---------------------------- | ------------------------------ | ------------------------------ |
| **Azure Blob**               | $0.005/10K ops ($0.50/million) | None                           |
| **AWS S3**                   | $0.0004/1K ops ($0.40/million) | 20,000 free GETs (12 months)   |
| **Cloudflare R2** (Standard) | $0.36/million                  | **10 million/month** (forever) |
| **Cloudflare R2** (IA)       | $0.90/million                  | **10 million/month** (forever) |

> **Note:** R2's Class B read operations are slightly pricier than raw S3/Azure per-operation — but because R2 has a generous free tier (10M reads/month free) AND zero egress, the total cost is still dramatically lower.

---

## 4. Feature Comparison Matrix

| Feature                    |             Azure Blob             |              AWS S3              |              Cloudflare R2              |
| -------------------------- | :--------------------------------: | :------------------------------: | :-------------------------------------: |
| **S3-compatible API**      |           ❌ (Azure SDK)           |            ✅ Native             |             ✅ Full S3 API              |
| **Lifecycle policies**     |      ✅ Hot→Cool→Cold→Archive      | ✅ Standard→IA→Glacier (6 tiers) |           ⚠️ Standard→IA only           |
| **Versioning**             |                 ✅                 |                ✅                |                   ✅                    |
| **Object Lock (WORM)**     |                 ✅                 |                ✅                |                   ✅                    |
| **Event notifications**    |          ✅ (Event Grid)           |     ✅ (S3 Events → Lambda)      |        ✅ (Event Notifications)         |
| **Custom domains**         |            ✅ (complex)            |       ✅ (via CloudFront)        |        ✅ (easy via Cloudflare)         |
| **Multipart upload**       |          ✅ (Block Blobs)          |                ✅                |                   ✅                    |
| **Max object size**        |              190.7 TB              |               5 TB               |         5 TB (315 GB per part)          |
| **Pre-signed URLs**        |          ✅ (SAS tokens)           |                ✅                |                   ✅                    |
| **Geographic replication** |          ✅ (GRS, RA-GRS)          |  ✅ (Cross-Region Replication)   | ⚠️ Automatic multi-region (no control)  |
| **Access tiers**           |    4 (Hot, Cool, Cold, Archive)    |      6 (Standard, IA, etc.)      |            2 (Standard, IA)             |
| **Encryption at rest**     |             ✅ AES-256             |            ✅ AES-256            |               ✅ AES-256                |
| **IAM / Access Control**   |         ✅ Azure AD + RBAC         |         ✅ IAM policies          |     ✅ API tokens + bucket policies     |
| **CDN integration**        | ⚠️ Separate (Azure CDN/Front Door) |     ⚠️ Separate (CloudFront)     | ✅ Built-in (Cloudflare global network) |
| **Workers/Functions**      |   ⚠️ Azure Functions (separate)    |    ⚠️ Lambda@Edge (separate)     |     ✅ Workers (native integration)     |

---

## 5. Memento-Specific Cost Scenarios

### Assumptions

- **Audio storage:** Primary cost driver (10 MB per 10-min podcast, 170 MB per 3-hr podcast)
- **Lifecycle:** Audio older than 30 days → Infrequent Access / Cool tier
- **Operations:** ~500K writes/month, ~20M–80M reads/month (streaming)
- **Base infrastructure:** Vercel Pro ($20) + Supabase Pro ($25) = $45/month fixed

### Scenario A: Launch Phase (< 100 GB stored, 100 GB/mo bandwidth)

| Cost Component           | Azure Hybrid | AWS Hybrid |       R2 Hybrid       |
| ------------------------ | :----------: | :--------: | :-------------------: |
| Base (Vercel + Supabase) |    $45.00    |   $45.00   |        $45.00         |
| Storage (90 GB hot)      |    $1.62     |   $2.07    |       **$1.20**       |
| Egress / CDN (100 GB)    |    $6.00     |   $8.50    |       **$0.00**       |
| API operations           |    ~$1.00    |   ~$1.00   | **$0.00** (free tier) |
| **Monthly Total**        |  **$53.62**  | **$56.57** |      **$46.20**       |
| **Annual Total**         |   **$643**   |  **$679**  |       **$554**        |

### Scenario B: Growth Phase (500 GB stored, 500 GB/mo bandwidth)

| Cost Component              | Azure Hybrid | AWS Hybrid | R2 Hybrid  |
| --------------------------- | :----------: | :--------: | :--------: |
| Base (Vercel + Supabase)    |    $45.00    |   $45.00   |   $45.00   |
| Storage — Hot (300 GB)      |    $5.40     |   $6.90    |   $4.35    |
| Storage — Cool/IA (200 GB)  |    $2.00     |   $2.50    |   $1.90    |
| Egress / CDN (500 GB)       |    $30.00    |   $42.50   | **$0.00**  |
| IA Retrieval (~50 GB)       |    $0.50     |   $0.50    |   $0.50    |
| API operations (~20M reads) |    ~$1.00    |   ~$1.00   |   $3.60    |
| **Monthly Total**           |  **$83.90**  | **$98.40** | **$55.35** |
| **Annual Total**            |  **$1,007**  | **$1,181** |  **$664**  |
| **Savings vs Azure**        |      —       |     —      |  **-34%**  |

### Scenario C: Scale Phase (2 TB stored, 2 TB/mo bandwidth)

| Cost Component              | Azure Hybrid | AWS Hybrid  | R2 Hybrid  |
| --------------------------- | :----------: | :---------: | :--------: |
| Base (Vercel + Supabase)    |    $45.00    |   $45.00    |   $45.00   |
| Storage — Hot (500 GB)      |    $9.00     |   $11.50    |   $7.35    |
| Storage — Cool/IA (1.5 TB)  |    $15.00    |   $18.75    |   $14.90   |
| Egress / CDN (2 TB)         |   $120.00    |   $170.00   | **$0.00**  |
| IA Retrieval (~200 GB)      |    $2.00     |    $2.00    |   $2.00    |
| API operations (~50M reads) |    ~$2.50    |   ~$2.00    |   $14.40   |
| **Monthly Total**           | **$193.50**  | **$249.25** | **$83.65** |
| **Annual Total**            |  **$2,322**  | **$2,991**  | **$1,004** |
| **Savings vs Azure**        |      —       |      —      |  **-57%**  |

### Scenario D: High Scale (5 TB stored, 3 TB/mo bandwidth)

| Cost Component              | Azure Hybrid | AWS Hybrid  |  R2 Hybrid  |
| --------------------------- | :----------: | :---------: | :---------: |
| Base (Vercel + Supabase)    |    $45.00    |   $45.00    |   $45.00    |
| Storage — Hot (1 TB)        |    $18.00    |   $23.00    |   $14.85    |
| Storage — Cool/IA (4 TB)    |    $40.00    |   $50.00    |   $40.86    |
| Egress / CDN (3 TB)         |   $180.00    |   $255.00   |  **$0.00**  |
| IA Retrieval (~300 GB)      |    $3.00     |    $3.00    |    $3.00    |
| API operations (~80M reads) |    ~$4.00    |   ~$3.20    |   $25.20    |
| **Monthly Total**           | **$290.00**  | **$379.20** | **$128.91** |
| **Annual Total**            |  **$3,480**  | **$4,550**  | **$1,547**  |
| **Savings vs Azure**        |      —       |      —      |  **-56%**   |

### Scenario E: Enterprise Scale (10 TB stored, 5 TB/mo bandwidth)

| Cost Component               | Azure Hybrid | AWS Hybrid  |  R2 Hybrid  |
| ---------------------------- | :----------: | :---------: | :---------: |
| Base (Vercel + Supabase)     |    $45.00    |   $45.00    |   $45.00    |
| Storage — Hot (2 TB)         |    $36.00    |   $46.00    |   $29.85    |
| Storage — Cool/IA (8 TB)     |    $80.00    |   $100.00   |   $81.82    |
| Egress / CDN (5 TB)          |   $300.00    |   $425.00   |  **$0.00**  |
| IA Retrieval (~500 GB)       |    $5.00     |    $5.00    |    $5.00    |
| API operations (~150M reads) |    ~$7.50    |   ~$6.00    |   $50.40    |
| **Monthly Total**            | **$473.50**  | **$627.00** | **$212.07** |
| **Annual Total**             |  **$5,682**  | **$7,524**  | **$2,545**  |
| **Savings vs Azure**         |      —       |      —      |  **-55%**   |

---

## 6. Cost Scaling Visualization

```
Monthly Cost ($)

$700 ┤
     │                                                    ▲ AWS
$600 ┤                                                   ╱
     │                                                  ╱
$500 ┤                                            ▲    ╱
     │                                      Azure╱   ╱
$400 ┤                                          ╱   ╱
     │                               ▲         ╱   ╱
$300 ┤                              ╱         ╱   ╱
     │                      ▲      ╱         ╱   ╱
$200 ┤                     ╱      ╱     ▲   ╱   ╱
     │              ▲     ╱      ╱     ╱   ╱   ╱
$100 ┤      ▲      ╱     ╱      ╱     ╱   ╱   ╱
     │  ▲  ╱  ●  ╱     ╱   ● ╱     ╱   ╱   ╱        ● R2
$50  ┤ ●  ╱  ╱  ╱  ●  ╱     ╱  ● ╱   ╱   ╱
     │╱  ╱  ╱  ╱  ╱  ╱     ╱  ╱ ╱   ╱   ╱
$0   ┼──┴──┴──┴──┴──┴──┴───┴──┴─┴───┴───┴───────
     0   100GB  500GB   2TB     5TB     10TB
                    Storage Scale
```

---

## 7. Summary Comparison Table

|       Scale        | Azure Hybrid | AWS Hybrid | **R2 Hybrid** | R2 vs Azure | R2 vs AWS |
| :----------------: | :----------: | :--------: | :-----------: | :---------: | :-------: |
|  Launch (100 GB)   |    $53.62    |   $56.57   |  **$46.20**   |    -14%     |   -18%    |
|  Growth (500 GB)   |    $83.90    |   $98.40   |  **$55.35**   |    -34%     |   -44%    |
|    Scale (2 TB)    |   $193.50    |  $249.25   |  **$83.65**   |    -57%     |   -66%    |
|    High (5 TB)     |   $290.00    |  $379.20   |  **$128.91**  |    -56%     |   -66%    |
| Enterprise (10 TB) |   $473.50    |  $627.00   |  **$212.07**  |    -55%     |   -66%    |

---

## 8. When NOT to Choose R2

R2 isn't universally superior. Consider Azure/AWS if:

| Scenario                                               |      Better Choice       | Why                                                                                   |
| ------------------------------------------------------ | :----------------------: | ------------------------------------------------------------------------------------- |
| **Compliance requiring specific geo-replication**      |       Azure / AWS        | R2 auto-distributes globally but you can't choose specific regions for data residency |
| **Deep archive (years of retention, rarely accessed)** | AWS Glacier Deep Archive | $0.00099/GB — 15x cheaper than R2 Standard for data you never touch                   |
| **Existing Azure/AWS infrastructure**                  |    Stay with existing    | Vendor consolidation has operational value                                            |
| **Enterprise SLAs with financial guarantees**          |       Azure / AWS        | Cloudflare's enterprise SLAs are less established                                     |
| **Complex IAM with org-level policies**                |           AWS            | IAM is far more granular on AWS                                                       |

For Memento, **none of these exceptions apply**. The data doesn't need specific regions, audio should be accessible (not archived), and we're building fresh infrastructure.

---

## 9. Migration Complexity

| Provider          | SDK / API                                          |                 Integration Effort                  | Auth Model                   |
| ----------------- | -------------------------------------------------- | :-------------------------------------------------: | ---------------------------- |
| **Azure Blob**    | `@azure/storage-blob` (npm)                        | Medium — Azure-specific SDK, SAS tokens or Azure AD | SAS tokens, Azure AD, RBAC   |
| **AWS S3**        | `@aws-sdk/client-s3` (npm)                         |          Medium — AWS SDK, IAM credentials          | IAM users/roles, access keys |
| **Cloudflare R2** | Any S3-compatible SDK (e.g., `@aws-sdk/client-s3`) |  **Low** — S3-compatible API, just change endpoint  | API tokens, presigned URLs   |

> **R2 migration advantage:** Because R2 uses the S3 API, you can use the same `@aws-sdk/client-s3` package with just an endpoint URL change. If you ever want to migrate between R2 and S3, the code is nearly identical.

---

## 10. Recommended Architecture: Vercel + Supabase + Cloudflare R2

```
┌─────────────────────────────────────────────────────────────────┐
│                       app.memento.ai                            │
│                    (Vercel Edge Network)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STATIC ASSETS (Vercel CDN)                                     │
│  ├── dist/index.html, *.js, *.css                               │
│                                                                  │
│  SERVERLESS FUNCTIONS (/api/*)                                  │
│  ├── /api/upload-audio      → Cloudflare R2 (server-side keys) │
│  ├── /api/nvidia-proxy      → NVIDIA NIM                        │
│  ├── /api/scholar-proxy     → Semantic Scholar                  │
│  └── /api/openalex-proxy    → OpenAlex                          │
│                                                                  │
├─────────────── MEDIA STORAGE ───────────────────────────────────┤
│                                                                  │
│  CLOUDFLARE R2 (S3-compatible)                                  │
│  ├── /audio-assets/         Generated podcasts (Standard tier)  │
│  ├── /slide-assets/         Slide images (Standard tier)        │
│  └── /archived-audio/       Old podcasts (IA tier, auto-moved)  │
│                                                                  │
│  ↕ Served via Cloudflare CDN ($0 egress)                        │
│  ↕ R2 public bucket or presigned URLs for playback              │
│                                                                  │
├─────────────── BACKEND SERVICES ────────────────────────────────┤
│                                                                  │
│  SUPABASE (unchanged)                                           │
│  ├── Auth (email, Google, GitHub)                                │
│  ├── PostgreSQL + pgvector (RLS, RPC functions)                 │
│  ├── Document storage (PDFs — small files, keeps in Supabase)   │
│  └── Realtime subscriptions                                     │
│                                                                  │
│  AI APIs (unchanged)                                            │
│  ├── OpenRouter, OpenAI, NVIDIA NIM, fal.ai                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Implementation Notes for R2

### Lifecycle Policy (Standard → Infrequent Access)

R2 supports lifecycle rules to auto-transition objects:

```json
{
  "rules": [
    {
      "id": "move-old-audio-to-ia",
      "enabled": true,
      "conditions": {
        "prefix": "audio-assets/",
        "age_days": 30
      },
      "actions": {
        "transition_storage_class": "InfrequentAccess"
      }
    },
    {
      "id": "delete-temp-assets",
      "enabled": true,
      "conditions": {
        "prefix": "temp/",
        "age_days": 7
      },
      "actions": {
        "delete": true
      }
    }
  ]
}
```

### Upload via Vercel Serverless Function

```typescript
// api/upload-audio.ts (Vercel Serverless Function)
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export default async function handler(req, res) {
  const buffer = Buffer.from(await req.arrayBuffer());
  const key = `audio-assets/${Date.now()}-${req.headers["x-filename"]}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "audio/mpeg",
    }),
  );

  // Return the public URL (R2 custom domain or public bucket URL)
  const cdnUrl = `https://media.memento.ai/${key}`;
  res.status(200).json({ url: cdnUrl });
}
```

### Environment Variables

| Variable               | Where                    | Purpose                             |
| ---------------------- | ------------------------ | ----------------------------------- |
| `CF_ACCOUNT_ID`        | Vercel env (server-side) | Cloudflare account identifier       |
| `R2_ACCESS_KEY_ID`     | Vercel env (server-side) | R2 API access key                   |
| `R2_SECRET_ACCESS_KEY` | Vercel env (server-side) | R2 API secret key                   |
| `R2_BUCKET_NAME`       | Vercel env (server-side) | Bucket name (e.g., `memento-media`) |
| `R2_PUBLIC_URL`        | Vercel env               | Custom domain for public access     |

---

## 12. Final Verdict

### Annual Cost Savings (R2 vs Azure vs AWS)

| Scale  | Azure Annual | AWS Annual | R2 Annual  | Saved vs Azure | Saved vs AWS  |
| :----: | :----------: | :--------: | :--------: | :------------: | :-----------: |
| 500 GB |    $1,007    |   $1,181   |  **$664**  |  **$343/yr**   |  **$517/yr**  |
|  2 TB  |    $2,322    |   $2,991   | **$1,004** | **$1,318/yr**  | **$1,987/yr** |
|  5 TB  |    $3,480    |   $4,550   | **$1,547** | **$1,933/yr**  | **$3,003/yr** |
| 10 TB  |    $5,682    |   $7,524   | **$2,545** | **$3,137/yr**  | **$4,979/yr** |

### 🏆 Recommendation

**Cloudflare R2 is the optimal choice for Memento's media storage.** The combination of:

1. **$0 egress** (eliminates the #1 cost driver for audio streaming)
2. **Competitive storage pricing** ($0.015/GB standard, $0.01/GB IA)
3. **S3-compatible API** (minimal code changes, vendor-portable)
4. **Built-in global CDN** (no separate CDN configuration or billing)
5. **Generous free tier** (10 GB storage + 10M reads/month — free forever)

...makes R2 the clear winner for Memento at **every scale tier**, saving **34–66%** compared to Azure and AWS alternatives.

The only scenario where Azure/AWS would be preferable is if Memento needed deep-archive storage for years-old data at sub-$0.001/GB pricing — which is not the case for an audio streaming product.
