# Memento — Full-Stack Cost Model

> **Purpose:** End-to-end cost estimation covering every API call, compute action, storage write, and bandwidth event in a user's lifecycle — from sign-up to daily usage at scale. Derived from actual code analysis of the Memento codebase.

---

## 1. What Happens Per User Action (The Real Cost Drivers)

### 1.1 User Signs Up

| Action               | Service       | API Call     | Cost                 |
| -------------------- | ------------- | ------------ | -------------------- |
| Create auth session  | Supabase Auth | 1 auth call  | $0 (included in Pro) |
| Create profile row   | Supabase DB   | 1 row insert | $0 (included in Pro) |
| **Total per signup** |               |              | **~$0.00**           |

---

### 1.2 User Creates a Notebook & Uploads a Document

**Typical document: 20-page academic PDF ≈ 40,000 characters ≈ 10,000 words ≈ 300 KB file**

#### Step-by-step breakdown:

| Step                   | Action                                           |                                  Size / Tokens                                   | Service             |     Cost      |
| ---------------------- | ------------------------------------------------ | :------------------------------------------------------------------------------: | ------------------- | :-----------: |
| 1                      | Upload PDF to Supabase Storage                   |                                     ~300 KB                                      | Supabase Storage    | $0 (included) |
| 2                      | Extract text (PDF.js, client-side)               |                                        —                                         | Browser             |      $0       |
| 3                      | Chunk text (1000 chars, 200 overlap)             |                                  **~50 chunks**                                  | Browser             |      $0       |
| 4                      | Generate embeddings for 50 chunks                |                       50 × ~250 tokens = **12,500 tokens**                       | NVIDIA BGE-M3 (NIM) |   ~$0.001¹    |
| 5                      | Store 50 embedding rows (1024-dim)               |                               ~200 KB in pgvector                                | Supabase DB         | $0 (included) |
| 6                      | LightRAG entity extraction (GPT-4o-mini)         | 50 chunks × ~400 tok/chunk input = **20,000 input tokens**, ~5,000 output tokens | OpenAI              |   ~$0.004²    |
| 7                      | Generate embeddings for ~30 entities + ~20 edges |                        50 × ~50 tokens = **2,500 tokens**                        | NVIDIA NIM          |   ~$0.0002    |
| 8                      | Store graph nodes + edges                        |                                     ~50 rows                                     | Supabase DB         | $0 (included) |
| **Total per document** |                                                  |                                                                                  |                     |  **~$0.005**  |

> ¹ NVIDIA NIM BGE-M3 free tier: 1,000 requests/day. Beyond that, ~$0.0001/1K tokens  
> ² GPT-4o-mini: $0.15/1M input, $0.60/1M output → 20K in + 5K out = $0.003 + $0.003 = $0.006

#### Document sizes in practice:

| Document Type    | Pages | Characters | Chunks | Embedding Tokens | LLM Tokens (Entity Extraction) |    Cost    |
| :--------------- | :---: | :--------: | :----: | :--------------: | :----------------------------: | :--------: |
| Short article    |  3–5  |   10,000   |  ~13   |      3,250       |     ~6,000 in / 1,500 out      | **$0.002** |
| Academic paper   | 10–20 |   40,000   |  ~50   |      12,500      |     ~20,000 in / 5,000 out     | **$0.005** |
| Textbook chapter | 30–50 |  100,000   |  ~125  |      31,250      |    ~50,000 in / 12,500 out     | **$0.012** |
| Full textbook    | 200+  |  500,000   |  ~625  |     156,250      |    ~250,000 in / 60,000 out    | **$0.074** |

---

### 1.3 User Chats with Documents (RAG)

**Per chat message:**

| Step                  | Action                                            |        Tokens        | Service           |     Cost     |
| --------------------- | ------------------------------------------------- | :------------------: | ----------------- | :----------: |
| 1                     | Generate query embedding                          |      ~50 tokens      | NVIDIA NIM        |  ~$0.00001   |
| 2                     | pgvector similarity search (top-5 chunks)         |          —           | Supabase DB       |      $0      |
| 3                     | LightRAG entity/relationship retrieval            |          —           | Supabase DB       |      $0      |
| 4                     | Build augmented prompt (system + context + query) | ~3,000 input tokens  | —                 |      —       |
| 5                     | LLM response generation                           | ~3,000 in + ~500 out | OpenRouter (Grok) | **~$0.005**³ |
| **Total per message** |                                                   |                      |                   | **~$0.005**  |

> ³ Grok 4.1 Fast via OpenRouter: ~$0.80/1M input, $3.20/1M output. 3K in = $0.0024, 500 out = $0.0016

**Per conversation (typical 10-message back-and-forth):**

- 10 queries × $0.005 = **~$0.05 per conversation**

---

### 1.4 User Generates Audio Podcast

This is the **most expensive single action** and the **biggest storage consumer**.

#### API Costs (Script Generation + TTS):

|  Duration   | Target Words |     Script Gen (LLM Calls)      | TTS Characters | TTS Cost (tts-1) | LLM Cost (Script) | Total API Cost |
| :---------: | :----------: | :-----------------------------: | :------------: | :--------------: | :---------------: | :------------: |
| **10 min**  |    1,500     |         1 initial call          |  ~9,000 chars  |    **$0.135**    |      ~$0.01       |   **~$0.15**   |
| **30 min**  |    6,500     |  1 initial + 3–5 continuations  | ~39,000 chars  |    **$0.585**    |      ~$0.04       |   **~$0.63**   |
| **1 hour**  |    13,000    | 1 initial + 10–14 continuations | ~78,000 chars  |    **$1.17**     |      ~$0.10       |   **~$1.27**   |
| **3 hours** |    40,000    | 1 initial + 25–30 continuations | ~240,000 chars |    **$3.60**     |      ~$0.25       |   **~$3.85**   |

> **OpenAI TTS-1 pricing:** $15.00 per 1M characters  
> **Script LLM (Grok 4.1 Fast via OpenRouter):** ~$0.80/M input, $3.20/M output. Each call ≈ 8K input + 4K output ≈ $0.006–$0.019 per call

#### Output File Sizes:

| Duration | Approx MP3 Size | Storage Cost (R2) | Storage Cost (Azure Hot) |
| :------: | :-------------: | :---------------: | :----------------------: |
|  10 min  |     ~10 MB      |    $0.00015/mo    |       $0.00018/mo        |
|  30 min  |     ~30 MB      |    $0.00045/mo    |       $0.00054/mo        |
|  1 hour  |     ~60 MB      |    $0.00090/mo    |       $0.00108/mo        |
| 3 hours  |     ~170 MB     |    $0.00255/mo    |       $0.00306/mo        |

---

### 1.5 User Generates Video Overview

Video generation includes slide images + narration audio.

| Component                  | Action                              | Estimated Cost |
| -------------------------- | ----------------------------------- | :------------: |
| Slide script generation    | GPT-4o call (~5K input, ~3K output) |     ~$0.04     |
| Slide images (5–10 slides) | fal.ai FLUX: ~$0.03/image × 8 avg   |     ~$0.24     |
| Narration audio            | TTS-1 for narration (~5,000 chars)  |    ~$0.075     |
| Image uploads              | 8 images × ~500 KB = ~4 MB          |  $0.00006/mo   |
| Audio upload               | ~10 MB narration                    |  $0.00015/mo   |
| **Total per video**        |                                     |   **~$0.36**   |

---

### 1.6 User Generates Flashcards / Quiz / Mind Map

These are **cheap** — text-only LLM calls, no TTS or image generation.

| Feature                   | LLM Input Tokens | LLM Output Tokens | Model              |    Cost     |
| ------------------------- | :--------------: | :---------------: | ------------------ | :---------: |
| **Flashcards (25 cards)** |      ~4,000      |      ~2,000       | Grok / GPT-4o-mini | **~$0.005** |
| **Quiz (10 questions)**   |      ~4,000      |      ~2,500       | Grok / GPT-4o-mini | **~$0.006** |
| **Mind Map**              |      ~3,000      |      ~2,000       | Grok / GPT-4o-mini | **~$0.004** |

---

### 1.7 User Generates Handbook (PDF Document)

Uses a multi-agent pipeline: research → structure → reasoning → visualization → quality → orchestrator.

| Step                   | Model                         | Est. Tokens (in/out) |    Cost    |
| ---------------------- | ----------------------------- | :------------------: | :--------: |
| Research agent         | gpt-4o-mini (2 calls)         |   15K in / 5K out    |  ~$0.005   |
| Structure agent        | gpt-4o (1 call)               |    8K in / 4K out    |   ~$0.06   |
| Reasoning agent        | gpt-4o (1 call)               |    8K in / 6K out    |   ~$0.07   |
| Visualization agent    | gpt-4o-mini (1 call)          |    5K in / 3K out    |  ~$0.003   |
| Quality agent          | gpt-4o-mini (1 call)          |    5K in / 2K out    |  ~$0.002   |
| Orchestrator           | gpt-4o / gpt-4-turbo (1 call) |   10K in / 3K out    |   ~$0.06   |
| **Total per handbook** |                               |                      | **~$0.20** |

> GPT-4o pricing: $2.50/1M input, $10.00/1M output  
> GPT-4o-mini: $0.15/1M input, $0.60/1M output

---

## 2. User Behavior Profiles (Monthly)

Based on a learning app, here are realistic usage profiles:

| Action                          | Casual User | Active Learner | Power User |
| ------------------------------- | :---------: | :------------: | :--------: |
| Notebooks created               |      1      |       3        |     8      |
| Documents uploaded per notebook |      2      |       4        |     8      |
| Chat messages                   |     20      |       80       |    250     |
| Audio podcasts (10 min)         |      1      |       3        |     5      |
| Audio podcasts (30 min)         |      0      |       1        |     3      |
| Audio podcasts (1 hr)           |      0      |       0        |     1      |
| Video overviews                 |      0      |       1        |     3      |
| Flashcard sets                  |      1      |       3        |     6      |
| Quizzes                         |      1      |       3        |     5      |
| Mind maps                       |      0      |       2        |     4      |
| Handbooks                       |      0      |       0        |     1      |
| **Audio storage generated/mo**  |  **10 MB**  |   **70 MB**    | **290 MB** |
| **Cumulative storage (12 mo)**  | **120 MB**  |   **840 MB**   | **3.5 GB** |

---

## 3. Monthly Cost Per User (API + Storage)

### 3.1 API Costs Per User Type

| Cost Component                                      |  Casual   |  Active   |   Power   |
| --------------------------------------------------- | :-------: | :-------: | :-------: |
| Document processing (embedding + entity extraction) |   $0.01   |   $0.06   |   $0.38   |
| RAG chat                                            |   $0.10   |   $0.40   |   $1.25   |
| Audio podcasts (TTS + LLM)                          |   $0.15   |   $2.04   |   $4.72   |
| Video overviews                                     |   $0.00   |   $0.36   |   $1.08   |
| Flashcards + Quizzes + Mind Maps                    |   $0.02   |   $0.05   |   $0.09   |
| Handbooks                                           |   $0.00   |   $0.00   |   $0.20   |
| **Total API cost/user/month**                       | **$0.28** | **$2.91** | **$7.72** |

### 3.2 Storage Costs Per User (Cumulative, Month 12)

| Cost Component                      |       Casual       |       Active       |       Power        |
| ----------------------------------- | :----------------: | :----------------: | :----------------: |
| Audio files stored (R2, month 12)   | 120 MB → $0.002/mo | 840 MB → $0.013/mo | 3.5 GB → $0.053/mo |
| Slide images (R2)                   |         ~0         | 24 MB → $0.0004/mo | 144 MB → $0.002/mo |
| Document uploads (Supabase)         |       600 KB       |       3.6 MB       |      19.2 MB       |
| DB rows (chunks + graph + messages) |     ~200 rows      |    ~1,400 rows     |    ~6,600 rows     |

---

## 4. Total Platform Cost at Scale

### Assumptions

- User mix: **60% Casual / 30% Active / 10% Power**
- Weighted average API cost: 0.6 × $0.28 + 0.3 × $2.91 + 0.1 × $7.72 = **$1.81/user/month**
- Weighted average storage/mo (month 12): 0.6 × 10MB + 0.3 × 70MB + 0.1 × 290MB = **56 MB/user/month** new data
- Audio bandwidth: each user streams ~2× their new monthly audio (re-listens + new) = **112 MB/user/month**

### Cost by User Scale (using R2 for storage)

|   Users    | API Costs | New Storage/mo | Cumulative Storage (Mo 12) | R2 Storage Cost | R2 Bandwidth | Supabase Pro | Vercel Pro | **Total/Month** | **Per User** |
| :--------: | :-------: | :------------: | :------------------------: | :-------------: | :----------: | :----------: | :--------: | :-------------: | :----------: |
|  **100**   |   $181    |     5.5 GB     |           66 GB            |      $0.84      |      $0      |     $25      |    $20     |    **$227**     |  **$2.27**   |
|  **500**   |   $905    |    27.3 GB     |           328 GB           |      $4.77      |      $0      |     $25      |    $20     |    **$955**     |  **$1.91**   |
| **1,000**  |  $1,810   |    54.7 GB     |           656 GB           |      $9.69      |      $0      |     $25      |    $20     |   **$1,865**    |  **$1.87**   |
| **2,000**  |  $3,620   |     109 GB     |           1.3 TB           |     $19.50      |      $0      |     $25      |    $20     |   **$3,685**    |  **$1.84**   |
| **5,000**  |  $9,050   |     273 GB     |           3.3 TB           |     $49.50      |      $0      |     $99⁴     |    $20     |   **$9,219**    |  **$1.84**   |
| **10,000** |  $18,100  |     547 GB     |           6.6 TB           |     $99.00      |      $0      |    $599⁵     |    $20     |   **$18,818**   |  **$1.88**   |

> ⁴ Supabase Team plan at 5K+ users for DB capacity  
> ⁵ Supabase Enterprise at 10K+ users

### The Same Table With Azure Instead of R2

|   Users    | API Costs | Azure Storage | Azure CDN (egress) | Supabase | Vercel | **Total/Month** | **vs R2** |
| :--------: | :-------: | :-----------: | :----------------: | :------: | :----: | :-------------: | :-------: |
|  **100**   |   $181    |     $1.19     |       $0.97        |   $25    |  $20   |    **$228**     |    +$1    |
|  **500**   |   $905    |     $5.90     |       $4.87        |   $25    |  $20   |    **$961**     |    +$6    |
| **1,000**  |  $1,810   |    $11.81     |       $9.73        |   $25    |  $20   |   **$1,877**    |   +$12    |
| **2,000**  |  $3,620   |    $23.40     |       $19.06       |   $25    |  $20   |   **$3,707**    |   +$22    |
| **5,000**  |  $9,050   |    $59.40     |       $47.78       |   $99    |  $20   |   **$9,276**    |   +$57    |
| **10,000** |  $18,100  |    $118.80    |       $95.55       |   $599   |  $20   |   **$18,933**   |   +$115   |

---

## 5. Critical Insight: API Costs Dominate, Not Storage

```
Cost breakdown at 2,000 users:

  API Calls (LLM + TTS)  ██████████████████████████████████████████████████ 98.2%  $3,620
  Object Storage          █                                                  0.5%  $19.50
  Supabase (DB + Auth)    █                                                  0.7%  $25
  Vercel (Hosting)        █                                                  0.5%  $20
```

### What this means:

1. **Storage provider choice (R2 vs Azure vs S3) barely matters at realistic scale.** At 2,000 users, the difference between R2 and Azure is only **$22/month** — while API costs are **$3,620/month**.

2. **The real cost driver is OpenAI TTS at $15/M characters.** A single 30-minute podcast costs $0.585 in TTS alone. At scale, TTS is 60–70% of total API costs.

3. **LLM costs are moderate** because script generation uses Grok 4.1 Fast (via OpenRouter, cheaper than GPT-4) and entity extraction uses GPT-4o-mini ($0.15/M input).

4. **Storage only becomes significant at 5TB+ scale** — which requires ~10,000+ users over 12+ months.

---

## 6. Critique of Original STORAGE_COST_TIERS Estimates

The original tier estimates had several issues:

### ❌ Issue 1: Storage numbers were not grounded in actual user behavior

| Original Assumption           | Reality (from code analysis)                                        |
| ----------------------------- | ------------------------------------------------------------------- |
| "500 users = 1 TB stored"     | 500 users (60/30/10 mix) at month 12 = **328 GB** — 3× overestimate |
| "2,000 users = 5 TB stored"   | 2,000 users at month 12 = **1.3 TB** — 4× overestimate              |
| "10,000 users = 25 TB stored" | 10,000 users at month 12 = **6.6 TB** — 4× overestimate             |

The original tiers assumed much higher per-user storage (2 GB/user) vs the realistic ~660 MB/user at 12 months.

### ❌ Issue 2: Bandwidth estimates were disconnected from usage

| Original Assumption                        | Reality                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| "500 users = 420 GB BW" (840 MB/user/mo)   | Realistic: 500 × 112 MB = **56 GB/mo** — 7.5× overestimate    |
| "10,000 users = 12 TB BW" (1.2 GB/user/mo) | Realistic: 10,000 × 112 MB = **1.1 TB/mo** — 11× overestimate |

### ❌ Issue 3: Only compared storage — ignored the real cost driver

The original document compared R2 vs Azure vs Supabase on **storage and bandwidth only**, which represents **< 2% of total costs**. The elephant in the room is:

|                       Real Cost Component | Monthly (at 2K users) | % of Total |
| ----------------------------------------: | :-------------------: | :--------: |
|                            **OpenAI TTS** |        ~$2,200        |    60%     |
| **LLM calls (scripts, chat, extraction)** |        ~$1,400        |    38%     |
|            **Object storage + bandwidth** |        ~$20–40        |    ~1%     |
|                     **Supabase + Vercel** |         ~$45          |    ~1%     |

### ✅ What the original got right

- **R2 is the cheapest storage provider** — this is correct
- **$0 egress is a genuine advantage** — though it matters less than expected because bandwidth volumes are lower than assumed
- **The tier structure (Light/Medium/Heavy) is useful** — just needs realistic numbers

---

## 7. Revised Cost Tiers (Grounded in Architecture)

### Tier A — Launch (100 users)

| Component                             | Monthly Cost |
| ------------------------------------- | :----------: |
| OpenAI TTS                            |     $96      |
| LLM calls (Grok, GPT-4o, GPT-4o-mini) |     $78      |
| Embeddings (NVIDIA NIM)               |      $2      |
| fal.ai (image generation)             |      $5      |
| R2 storage (6.6 GB at month 6)        |    $0.08     |
| Supabase Pro                          |     $25      |
| Vercel Pro                            |     $20      |
| **Total**                             | **$226/mo**  |
| **Per user**                          | **$2.26/mo** |

### Tier B — Growth (1,000 users)

| Component                      | Monthly Cost  |
| ------------------------------ | :-----------: |
| OpenAI TTS                     |     $963      |
| LLM calls                      |     $780      |
| Embeddings                     |      $15      |
| fal.ai                         |      $52      |
| R2 storage (328 GB at month 6) |     $4.77     |
| Supabase Pro                   |      $25      |
| Vercel Pro                     |      $20      |
| **Total**                      | **$1,860/mo** |
| **Per user**                   | **$1.86/mo**  |

### Tier C — Scale (5,000 users)

| Component                      | Monthly Cost  |
| ------------------------------ | :-----------: |
| OpenAI TTS                     |    $4,815     |
| LLM calls                      |    $3,900     |
| Embeddings                     |      $75      |
| fal.ai                         |     $260      |
| R2 storage (1.6 TB at month 6) |      $24      |
| Supabase Team                  |      $99      |
| Vercel Pro                     |      $20      |
| **Total**                      | **$9,193/mo** |
| **Per user**                   | **$1.84/mo**  |

---

## 8. Cost Reduction Strategies

| Strategy                                                                       |          Savings          | Implementation Effort |
| ------------------------------------------------------------------------------ | :-----------------------: | :-------------------: |
| **Switch TTS to tts-1-hd selectively** (only for premium users)                |     Queue management      |          Low          |
| **Use OpenAI TTS mini** (if/when available)                                    |    50–70% TTS savings     |          Low          |
| **Use Grok free tier for scripts** instead of paid                             |   ~$800/mo at 1K users    |    Already done ✅    |
| **Use GPT-4o-mini everywhere** (instead of GPT-4o)                             |     ~40% LLM savings      |        Medium         |
| **Cache popular embeddings**                                                   | 20–30% embedding savings  |        Medium         |
| **Limit free tier podcast length** to 10 min                                   |      60% TTS savings      |          Low          |
| **Move TTS to ElevenLabs** (cheaper at scale: $0.18/1K chars vs OpenAI $15/1M) | Actually similar at scale |        Medium         |
| **Use open-source TTS** (Coqui/XTTS on GPU)                                    |      90% TTS savings      |         High          |
| **R2 Infrequent Access** for audio > 30 days                                   |    33% storage savings    |          Low          |

### Biggest bang for buck: **Limit free-tier audio to 10 min** and **gate 30min+ behind paid plans**

At 1,000 users, if you limit free users to 10-min podcasts only:

- Current TTS cost: ~$963/mo
- With limit: ~$350/mo — **saves $613/mo**

---

## 9. Pricing Implications

To break even on API costs at the **weighted average of $1.84/user/month**:

| Pricing Tier | Price/Month |  Margin After API Costs   |
| :----------: | :---------: | :-----------------------: |
|     Free     |     $0      |  **-$1.84** (subsidized)  |
|   Starter    |    $9.99    | **+$8.15** (~82% margin)  |
|     Pro      |   $19.99    | **+$18.15** (~91% margin) |
|     Team     |   $29.99    | **+$28.15** (~94% margin) |

**You need ~1 paying user at $9.99 to subsidize ~5 free users** (assuming free users are casual = $0.28/mo API cost). This is a healthy SaaS unit economics model.

---

## Summary

| Metric                                      |          Value          |
| ------------------------------------------- | :---------------------: |
| **Cost per new document processed**         |      $0.005–$0.07       |
| **Cost per chat message**                   |         $0.005          |
| **Cost per 10-min podcast**                 |          $0.15          |
| **Cost per 30-min podcast**                 |          $0.63          |
| **Cost per 1-hr podcast**                   |          $1.27          |
| **Cost per video overview**                 |          $0.36          |
| **Cost per flashcard/quiz set**             |         $0.005          |
| **Cost per handbook**                       |          $0.20          |
| **Weighted average user cost/month**        |        **$1.84**        |
| **% of cost = API calls**                   |         **98%**         |
| **% of cost = storage**                     |        **< 2%**         |
| **R2 vs Azure storage delta (at 2K users)** | **$22/mo** (negligible) |
| **Break-even pricing**                      |   **~$2/user/month**    |
