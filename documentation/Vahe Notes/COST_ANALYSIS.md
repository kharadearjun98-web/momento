# Cost Analysis — Memento
## April 18, 2026

> Where the money actually goes. Synthesized from the codebase and the detailed breakdowns under [documentation/Cost/](../Cost/).

---

## TL;DR

**Two line items are 98% of spend: TTS and LLM inference.** Everything else — storage, hosting, email, embeddings, database — is a rounding error at current scale. Any cost conversation that isn't about audio generation or model choice is optimizing the wrong thing.

At **1,000 MAU**, projected monthly cost ≈ **$1,670** before optimization.
At **2,000 MAU**, projected monthly cost ≈ **$3,685** before optimization.

---

## Cost Factor Ranking (1,000 MAU)

| # | Cost Factor | Monthly | % of Total | Driver |
|---|-------------|---------|------------|--------|
| 1 | **OpenAI TTS-1** | ~$963 | **~58%** | Podcast audio, 64M chars/mo at $15/1M chars |
| 2 | **LLM inference (all models)** | ~$587 | **~35%** | Grok 4.1, GPT-4o, GPT-4o-mini across chat, podcasts, handbooks, slides, extraction |
| 3 | fal.ai FLUX (image gen) | ~$52 | ~3% | Video slide images, ~$0.03/image |
| 4 | Supabase Pro | $25 | ~1.5% | DB + auth + storage (bundled) |
| 5 | Vercel Pro | $20 | ~1.2% | Static hosting + serverless proxy |
| 6 | NVIDIA BGE-M3 embeddings | ~$7–15 | <1% | Mostly free tier (1K req/day) |
| 7 | Object storage (R2 planned) | ~$10 | <1% | 656 GB × $0.015, zero egress |
| 8 | Email (Resend/Web3Forms) | ~$0 | ~0% | Password resets, verification only |

---

## The Biggest Cost Factors, Explained

### 1. Text-to-Speech (the elephant)
- **File**: [lib/audioGenerator.ts](../../lib/audioGenerator.ts)
- **Service**: OpenAI TTS-1 at **$15 per 1M characters**
- A single 30-minute podcast ≈ **$0.585** in TTS alone. Debate/roundtable formats push that to **$3.60**.
- TTS is **per-character, per-generation, un-cacheable** — every regeneration pays full price.
- **Biggest lever in the whole app.** Swapping to Unreal Speech ($1/1M chars) removes ~$870/mo at 1K MAU — a 90% cut on the #1 line item. See [LLM_OPTIMIZATION.md](../Cost/LLM_OPTIMIZATION.md) and [OPTIMIZATION_STRATEGY.md](../Cost/OPTIMIZATION_STRATEGY.md).

### 2. LLM inference (death by many features)
Five models are wired up across the app:

| Feature | Model | File |
|---------|-------|------|
| RAG chat | Grok 4.1 Fast (OpenRouter) | [lib/aiChat.ts](../../lib/aiChat.ts) |
| Podcast scripts | Grok 4.1 Fast | [lib/audioGenerator.ts](../../lib/audioGenerator.ts) |
| Handbook generation | GPT-4o | [lib/documentGenerator/agents/](../../lib/documentGenerator/agents/) |
| Slide scripts | GPT-4o-mini | [lib/slideGenerator.ts](../../lib/slideGenerator.ts) |
| Entity/relation extraction | GPT-4o-mini | [lib/lightrag.ts](../../lib/lightrag.ts) |

- **Chat is the quiet killer**: ~$0.005 per message, but power users send hundreds/mo. Unbounded chat history amplifies this because each turn re-sends the full context.
- **Handbook + slide gen are spiky**: a single long handbook can burn $0.30–$0.80 in one request.
- Swapping Grok/GPT-4o → DeepSeek V3 / Gemini 2.5 Flash-Lite for non-critical paths saves **~$525/mo** (89% of the LLM bill).

### 3. Image generation (fal.ai FLUX)
- ~8 images per video × ~300 videos/mo ≈ **$52/mo**
- Small today, but **scales linearly with video adoption**. Watch this line if videos become a key output.

### 4. Everything else is noise
- Supabase, Vercel, R2, email, embeddings combined = **<4% of monthly spend**.
- The extensive [CLOUD_STORAGE_COMPARISON.md](../Cost/CLOUD_STORAGE_COMPARISON.md) and [STORAGE_COST_TIERS.md](../Cost/STORAGE_COST_TIERS.md) analyses optimize a line item worth ~$10/mo. Educational, but not where the leverage lives.

---

## What Changes at Scale

| Metric | 1K MAU | 2K MAU | 10K MAU (est.) |
|--------|--------|--------|----------------|
| TTS | $963 | $2,205 | ~$11,000 |
| LLM | $587 | $1,480 | ~$7,400 |
| Infra + storage | ~$120 | ~$200 | ~$700 |
| **Total** | **~$1,670** | **~$3,685** | **~$19,000** |

**Cost scales ~linearly with usage, not users.** A free tier with uncapped podcast length is far more expensive than a free tier with uncapped signups.

---

## Top 3 Levers (Ranked by ROI)

1. **Cap free-tier podcast length to 10 minutes** — ~$613/mo savings, ~1 day of work. Product change, not infra.
2. **Swap TTS provider to Unreal Speech (or self-host)** — ~$870/mo savings, ~1 week of work including QA on voice quality.
3. **Downgrade non-critical LLM calls to DeepSeek V3 / Gemini Flash-Lite** — ~$525/mo savings, ~3–5 days. Entity extraction and slide scripts don't need GPT-4o.

Combined potential: **~$2,000/mo saved at 1K MAU** — i.e., cut the bill roughly in half before even touching caching, BYOK, or storage tiering.

---

## Things Worth Flagging

- **No semantic/response caching exists today.** Same document → same handbook → paid twice. See [OPTIMIZATION_STRATEGY.md](../Cost/OPTIMIZATION_STRATEGY.md) for the caching plan.
- **No per-user usage metering.** We can't tell which users are burning budget. Before any pricing tier launch, we need at least per-user token + TTS-character counters in the DB.
- **BYOK toggle** (user supplies their own API key) would let power users absorb their own cost — a near-zero-effort safety valve until pricing tiers exist.
- **The R2 hybrid deployment plan** ([AZURE_HYBRID_DEPLOYMENT_PLAN.md](../AZURE_HYBRID_DEPLOYMENT_PLAN.md)) is an infra optimization, not a cost optimization. R2's $0 egress saves ~$120/mo at 2 TB bandwidth vs Supabase Storage, but the TTS and LLM lines — 98% of spend — don't care where media is stored.

---

## Related docs

- [Cost/COST_DRIVERS_ANALYSIS.md](../Cost/COST_DRIVERS_ANALYSIS.md) — full per-feature cost breakdown
- [Cost/LLM_OPTIMIZATION.md](../Cost/LLM_OPTIMIZATION.md) — model-by-model replacement recommendations
- [Cost/OPTIMIZATION_STRATEGY.md](../Cost/OPTIMIZATION_STRATEGY.md) — caching, BYOK, tiering playbook
- [Cost/CLOUD_STORAGE_COMPARISON.md](../Cost/CLOUD_STORAGE_COMPARISON.md) — R2 vs Azure vs S3 (low-priority)
- [Cost/STORAGE_COST_TIERS.md](../Cost/STORAGE_COST_TIERS.md) — per-user storage growth curves
