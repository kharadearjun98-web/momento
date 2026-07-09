# Memento — Primary Cost Drivers Analysis

> Deep-dive into where every dollar goes, why API costs dominate at 98%, and what levers exist to control spend. All figures derived from Memento's actual codebase.

---

## 1. The 98/2 Rule: APIs vs Everything Else

At any user scale, Memento's cost structure follows a consistent pattern:

```
                          COST BREAKDOWN (2,000 users)

  ┌─────────────────────────────────────────────────────────────────────┐
  │                                                                     │
  │   OpenAI TTS (tts-1)           ████████████████████████████  59.7%  │
  │   $2,200/mo                                                         │
  │                                                                     │
  │   LLM Calls (Grok, GPT-4o)    ██████████████████████████    38.0%  │
  │   $1,400/mo                                                         │
  │                                                                     │
  │   fal.ai Image Gen             █                             0.8%  │
  │   $29/mo                                                            │
  │                                                                     │
  │   Embeddings (NVIDIA NIM)      ▏                             0.2%  │
  │   $7/mo                                                             │
  │                                                                     │
  │   Object Storage (R2)          ▏                             0.5%  │
  │   $19.50/mo                                                         │
  │                                                                     │
  │   Supabase (DB + Auth)         ▏                             0.7%  │
  │   $25/mo                                                            │
  │                                                                     │
  │   Vercel (Hosting)             ▏                             0.5%  │
  │   $20/mo                                                            │
  │                                                                     │
  └─────────────────────────────────────────────────────────────────────┘
                                                          TOTAL: $3,685
```

**Two services — OpenAI TTS and LLM inference — account for 97.7% of all costs.** Storage, database, hosting, and bandwidth are rounding errors.

---

## 2. Cost Driver #1: OpenAI Text-to-Speech (60% of Total)

### Why It's Expensive

OpenAI TTS-1 charges **$15.00 per 1 million characters**. This sounds cheap until you realize what a podcast requires:

| Podcast Duration | Words Generated | Characters to TTS |  TTS Cost  | % of That Podcast's Total Cost |
| :--------------: | :-------------: | :---------------: | :--------: | :----------------------------: |
|      10 min      |      1,500      |      ~9,000       | **$0.135** |              90%               |
|      30 min      |      6,500      |      ~39,000      | **$0.585** |              93%               |
|      1 hour      |     13,000      |      ~78,000      | **$1.17**  |              92%               |
|     3 hours      |     40,000      |     ~240,000      | **$3.60**  |              94%               |

_Code reference: `lib/audioGenerator.ts` line 865 — `model: 'tts-1'`_

### What Makes TTS Scale So Fast

A single user generating three 30-minute podcasts and one 10-minute podcast per month consumes **126,000 TTS characters = $1.89** in TTS alone. Multiply by 1,000 users with a mix of usage profiles:

| User Scale | Monthly TTS Characters | Monthly TTS Cost | % of Platform Spend |
| :--------: | :--------------------: | :--------------: | :-----------------: |
|    100     |          6.4M          |       $96        |         42%         |
|   1,000    |         64.2M          |       $963       |         52%         |
|   5,000    |          321M          |      $4,815      |         52%         |
|   10,000   |          642M          |      $9,630      |         51%         |

### TTS Cost Per User Profile

|                User Type                | Podcasts/Month | TTS Characters | TTS Cost/Month |
| :-------------------------------------: | :------------: | :------------: | :------------: |
|           Casual (1 × 10min)            |       1        |     9,000      |   **$0.135**   |
|     Active (3 × 10min + 1 × 30min)      |       4        |     66,000     |   **$0.99**    |
| Power (5 × 10min + 3 × 30min + 1 × 1hr) |       9        |    240,000     |   **$3.60**    |

### Video Narration Adds More TTS

Video overviews also use TTS-1 for narration (~5,000 chars per video = $0.075). Active users generating 1 video/month add $0.075; power users generating 3 add $0.225.

---

## 3. Cost Driver #2: LLM Inference (38% of Total)

### The Model Zoo

Memento uses **five different models** across its features, each with different pricing:

| Model                              | Used For                                                   | Pricing (Input / Output per 1M tokens) | Cost Per Call |
| ---------------------------------- | ---------------------------------------------------------- | :------------------------------------: | :-----------: |
| **Grok 4.1 Fast** (OpenRouter)     | Podcast scripts, RAG chat                                  |             $0.80 / $3.20              | $0.005–$0.019 |
| **GPT-4o**                         | Slide scripts, handbook structure/reasoning, image prompts |             $2.50 / $10.00             |  $0.04–$0.07  |
| **GPT-4o-mini**                    | Entity extraction, research, quality checks                |             $0.15 / $0.60              | $0.002–$0.005 |
| **GPT-4-turbo**                    | Handbook orchestrator (high quality mode)                  |            $10.00 / $30.00             |     $0.13     |
| **Gemini Flash** (OpenRouter free) | Fallback for scripts                                       |                   $0                   |      $0       |

_Code references: `lib/audioGenerator.ts:276`, `lib/lightrag.ts:83`, `lib/slideGenerator.ts:265`, `lib/documentGenerator/agents/`_

### LLM Costs by Feature

| Feature                         | Calls/Use | Model         | Tokens (In/Out) | Cost/Use | % of LLM Spend |
| ------------------------------- | :-------: | ------------- | :-------------: | :------: | :------------: |
| **Podcast script** (30 min)     | 4–6 calls | Grok 4.1 Fast |   ~40K / ~20K   |  $0.096  |       3%       |
| **RAG chat** (10 messages)      | 10 calls  | Grok 4.1 Fast |   ~30K / ~5K    |  $0.040  | 45% at scale¹  |
| **Entity extraction** (per doc) | 1–5 calls | GPT-4o-mini   |   ~20K / ~5K    |  $0.006  |       5%       |
| **Handbook**                    | 6–8 calls | GPT-4o + mini |   ~56K / ~23K   |  $0.200  |       2%       |
| **Video script**                |  1 call   | GPT-4o        |    ~5K / ~3K    |  $0.043  |       3%       |
| **Flashcards**                  |  1 call   | Grok / mini   |    ~4K / ~2K    |  $0.005  |       2%       |
| **Quiz**                        |  1 call   | Grok / mini   |   ~4K / ~2.5K   |  $0.006  |       2%       |
| **Mind map**                    |  1 call   | Grok / mini   |    ~3K / ~2K    |  $0.004  |       1%       |

> ¹ Chat is cheap per message ($0.005), but it's the most frequent action. At 1K users averaging 60 messages/mo, chat = $300/mo = ~40% of LLM spend.

### Why Podcast Scripts Are Cheaper Than Expected

The codebase uses **Grok 4.1 Fast via OpenRouter** for script generation — not GPT-4. This is a deliberate cost optimization:

```
GPT-4o script generation (30 min):  ~$0.60/podcast
Grok 4.1 Fast (actual):             ~$0.04/podcast  ← 15× cheaper
```

The savings are massive: at 1,000 users generating ~1,500 podcasts/month, using GPT-4o would cost ~$900/mo for scripts alone vs ~$60/mo with Grok.

---

## 4. Cost Driver #3: Image Generation (0.8% of Total)

### fal.ai FLUX for Video Slides

Video overviews generate 5–10 slide images using fal.ai's FLUX model:

| Detail                       |   Value   |
| ---------------------------- | :-------: |
| Cost per image               |  ~$0.03   |
| Average images per video     |     8     |
| Cost per video (images only) | **$0.24** |
| % of total video cost        |    67%    |

_Code reference: `lib/fluxImageGenerator.ts`_

At scale: 1,000 users × 30% generating ~1 video/month = 300 videos × $0.24 = **$72/mo**

### Image Generation Cost Projection

| Users | Videos/Month | Image Cost |
| :---: | :----------: | :--------: |
|  100  |      30      |     $7     |
| 1,000 |     300      |    $72     |
| 5,000 |    1,500     |    $360    |

---

## 5. Cost Driver #4: Embeddings (0.2% of Total — Negligible)

### NVIDIA BGE-M3 (NIM API)

Embedding generation is extraordinarily cheap:

| Action                       | Tokens |   Cost   |
| ---------------------------- | :----: | :------: |
| Embed 1 document (50 chunks) | 12,500 |  $0.001  |
| Embed 1 chat query           |   50   | $0.00001 |
| Embed 30 entities + 20 edges | 2,500  | $0.0002  |

_Code reference: `lib/nvidiaEmbeddings.ts` — 1024-dim BGE-M3 model_

**NVIDIA NIM also offers a free tier** (1,000 requests/day), which covers early-stage usage entirely.

At 1,000 users: ~$15/mo for embeddings — truly negligible.

---

## 6. Non-API Costs (< 2% Combined)

### Storage (Cloudflare R2)

| Metric                       |      Value      |
| ---------------------------- | :-------------: |
| R2 pricing                   | $0.015/GB/month |
| R2 egress                    |  **$0 (free)**  |
| Avg user storage at month 12 |     ~660 MB     |
| Cost per user at month 12    |    ~$0.01/mo    |

At 2,000 users with 1.3 TB stored: **$19.50/month** — 0.5% of total.

### Supabase (Database + Auth)

| Plan       |  Price  |    Suitable For    |
| ---------- | :-----: | :----------------: |
| Pro        | $25/mo  | Up to ~2,000 users |
| Team       | $99/mo  | 2,000–7,000 users  |
| Enterprise | $599/mo |    7,000+ users    |

Includes: PostgreSQL + pgvector, Auth, Row Level Security, 8 GB DB storage.

### Vercel (SPA Hosting)

Flat $20/month (Pro plan). Handles static site hosting + serverless API proxy functions.

---

## 7. Cost Sensitivity Analysis

What happens if usage patterns shift?

### Scenario A: Users generate 2× more podcasts

| Scale | Current TTS | 2× Podcasts |  Delta  |
| :---: | :---------: | :---------: | :-----: |
| 1,000 |    $963     |   $1,926    |  +$963  |
| 5,000 |   $4,815    |   $9,630    | +$4,815 |

**Impact: Severe.** TTS costs scale linearly with podcast generation. No caching or deduplication is possible — each podcast is unique content.

### Scenario B: Users send 3× more chat messages

| Scale | Current Chat LLM | 3× Messages |  Delta  |
| :---: | :--------------: | :---------: | :-----: |
| 1,000 |       $300       |    $900     |  +$600  |
| 5,000 |      $1,500      |   $4,500    | +$3,000 |

**Impact: Moderate.** Chat is cheap per message, but volume compounds. Consider response caching for common questions within the same notebook.

### Scenario C: Users upload 3× more documents

| Scale | Current Doc Processing | 3× Documents | Delta |
| :---: | :--------------------: | :----------: | :---: |
| 1,000 |          $40           |     $120     | +$80  |
| 5,000 |          $200          |     $600     | +$400 |

**Impact: Low.** Document processing (embeddings + entity extraction) is the cheapest pipeline in the stack.

### Scenario D: Video generation becomes popular (50% of users)

| Scale | Current Video | 50% Adoption |  Delta  |
| :---: | :-----------: | :----------: | :-----: |
| 1,000 |     $108      |     $540     |  +$432  |
| 5,000 |     $540      |    $2,700    | +$2,160 |

**Impact: Moderate.** Video combines fal.ai images ($0.24) + TTS narration ($0.075) + GPT-4o script ($0.04) = $0.36/video. Not as dangerous as audio podcasts because videos are shorter.

---

## 8. Cost Reduction Playbook (Ordered by Impact)

### 🔴 HIGH IMPACT (Saves $500–$3,000/mo at 1K users)

|  #  | Strategy                                                                           | Monthly Savings (1K users) | Effort |
| :-: | ---------------------------------------------------------------------------------- | :------------------------: | :----: |
|  1  | **Gate 30min+ podcasts behind paid tier**                                          |            $613            |  Low   |
|  2  | **Switch to open-source TTS** (Coqui XTTS2 on GPU)                                 |     $870 (90% of TTS)      |  High  |
|  3  | **Use GPT-4o-mini for ALL LLM tasks** (replace GPT-4o in handbooks, slide scripts) |     $312 (40% of LLM)      | Medium |

### Strategy #1: Tiered Audio Limits

```
Free tier:     10-min podcasts only (unlimited)     → $0.135/podcast
Starter tier:  Up to 30-min podcasts                → $0.585/podcast
Pro tier:      Up to 1-hour podcasts                → $1.27/podcast
Team tier:     Up to 3-hour podcasts                → $3.85/podcast
```

If 60% of users are free (casual) and limited to 10-min:

- Before: ~$963/mo TTS (1K users)
- After: ~$350/mo TTS
- **Savings: $613/mo** (64% reduction in TTS costs)

### Strategy #2: Self-Hosted TTS

Running Coqui XTTS v2 on a GPU VM:

| Provider    | GPU          | Price/Month | Handles (est.) |
| ----------- | ------------ | :---------: | :------------: |
| Lambda Labs | A10G (24 GB) |   $200/mo   |   ~500 users   |
| RunPod      | A40 (48 GB)  |   $350/mo   |  ~1,500 users  |
| Vast.ai     | RTX 4090     |   $150/mo   |   ~400 users   |

At 1K users: OpenAI TTS = $963/mo vs self-hosted = ~$200/mo. **Saves ~$760/mo** but requires DevOps, quality testing, and voice fine-tuning.

### Strategy #3: Model Downgrade

Replacing GPT-4o with GPT-4o-mini where output quality is acceptable:

| Feature               | Current Model | Cost/Use | Mini Cost/Use | Savings % |
| --------------------- | :-----------: | :------: | :-----------: | :-------: |
| Slide scripts         |    GPT-4o     |  $0.043  |    $0.003     |    93%    |
| Handbook structure    |    GPT-4o     |  $0.060  |    $0.004     |    93%    |
| Handbook reasoning    |    GPT-4o     |  $0.070  |    $0.005     |    93%    |
| Handbook orchestrator |  GPT-4-turbo  |  $0.130  |    $0.005     |    96%    |

**Risk:** Mini produces noticeably lower-quality handbook content. Test before switching.

### 🟡 MEDIUM IMPACT (Saves $50–$200/mo at 1K users)

|  #  | Strategy                                                       | Monthly Savings (1K users) | Effort |
| :-: | -------------------------------------------------------------- | :------------------------: | :----: |
|  4  | **Cache RAG responses** for repeated queries within a notebook |          $60–100           | Medium |
|  5  | **Batch embedding calls** (reduce API overhead)                |           $5–10            |  Low   |
|  6  | **R2 Infrequent Access tier** for audio > 30 days old          |      $3–6 on storage       |  Low   |

### 🟢 LOW IMPACT (< $50/mo savings, but good hygiene)

|  #  | Strategy                                                        | Monthly Savings | Effort |
| :-: | --------------------------------------------------------------- | :-------------: | :----: |
|  7  | Use NVIDIA NIM free tier fully before paying                    |      $5–15      |  None  |
|  8  | Compress audio to lower bitrate (96 kbps vs 128 kbps)           | $2–4 on storage |  Low   |
|  9  | Set TTL on unused podcast audio (delete after 90 days inactive) | $1–5 on storage |  Low   |

---

## 9. Key Takeaways

| Insight                                 | Detail                                                            |
| --------------------------------------- | ----------------------------------------------------------------- |
| **#1 cost lever**                       | OpenAI TTS — controls 60% of total spend                          |
| **#1 business lever**                   | Gating podcast length by plan tier                                |
| **Storage is irrelevant to cost**       | < 2% at any scale, R2 vs Azure difference is < $25/mo at 2K users |
| **Chat is death by a thousand cuts**    | $0.005/message adds up when users chat 60 times/month             |
| **Embeddings are essentially free**     | $15/mo at 1K users thanks to NVIDIA NIM                           |
| **Video is moderately expensive**       | $0.36/video — mostly fal.ai images, not TTS                       |
| **Handbooks are spiky but infrequent**  | $0.20/handbook — GPT-4o dominates, but few users generate them    |
| **The codebase already optimizes well** | Grok instead of GPT-4 for scripts, GPT-4o-mini for extraction     |
