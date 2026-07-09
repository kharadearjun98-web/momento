# Memento — LLM Cost Optimization Deep Dive

> Feature-by-feature analysis of every LLM call in Memento, with specific model swap recommendations that can reduce LLM costs by **75–90%** while maintaining or improving output quality.

---

## 1. Current LLM Usage Map

Memento uses **5 different models** across **8 features**. Here's a complete audit:

|  #  | Feature                     | Current Model |    Via     | Input/Output per 1M Tokens | Est. Cost/Use |
| :-: | --------------------------- | :-----------: | :--------: | :------------------------: | :-----------: |
|  1  | **Podcast Script**          | Grok 4.1 Fast | OpenRouter |       $0.80 / $3.20        |    $0.096     |
|  2  | **RAG Chat**                | Grok 4.1 Fast | OpenRouter |       $0.80 / $3.20        |    $0.005     |
|  3  | **Entity Extraction**       |  GPT-4o-mini  |   OpenAI   |       $0.15 / $0.60        |    $0.006     |
|  4  | **Slide Scripts**           |    GPT-4o     |   OpenAI   |       $2.50 / $10.00       |    $0.043     |
|  5  | **Handbook (Structure)**    |    GPT-4o     |   OpenAI   |       $2.50 / $10.00       |    $0.060     |
|  6  | **Handbook (Orchestrator)** |  GPT-4-turbo  |   OpenAI   |      $10.00 / $30.00       |    $0.130     |
|  7  | **Flashcards / Quiz**       | Grok 4.1 Fast | OpenRouter |       $0.80 / $3.20        |    $0.005     |
|  8  | **Mind Map**                | Grok 4.1 Fast | OpenRouter |       $0.80 / $3.20        |    $0.004     |

**Current blended LLM cost at 1,000 users: ~$1,400/mo**

---

## 2. The Replacement Candidates (2026 Pricing)

A new generation of models offers **frontier-level quality at commodity pricing**:

| Model                                                             |      Provider       | Input / Output per 1M Tokens | Context | Quality (MMLU) | Best For             |
| ----------------------------------------------------------------- | :-----------------: | :--------------------------: | :-----: | :------------: | -------------------- |
| **Gemini 2.5 Flash-Lite**                                         |       Google        |      **$0.10 / $0.40**       |   1M    |      ~85%      | Bulk text gen, chat  |
| **Gemini 2.0 Flash**                                              |  Google/OpenRouter  |      **$0.10 / $0.40**       |   1M    |      ~83%      | Scripts, extraction  |
| **DeepSeek V3**                                                   | DeepSeek/OpenRouter |      **$0.25 / $0.38**       |  128K   |     88.5%      | Reasoning, code      |
| **DeepSeek V3** (cached)                                          |      DeepSeek       |      **$0.14 / $0.38**       |  128K   |     88.5%      | Repeated prompts     |
| **Groq Llama 3.3 70B**                                            |        Groq         |      **$0.59 / $0.79**       |  128K   |      ~86%      | Ultra-fast inference |
| **Groq Mixtral 8x7B**                                             |        Groq         |      **$0.27 / $0.27**       |   32K   |      ~79%      | Simple tasks, fast   |
| **ByteDance Seed 1.6 Flash**                                      |     OpenRouter      |      **$0.07 / $0.30**       |  256K   |      ~82%      | Budget scripts       |
| **Free models** (DeepSeek R1, Gemini Flash free, Qwen3, Nemotron) |     OpenRouter      |      **$0.00 / $0.00**       | Varies  |     75-85%     | Fallbacks            |

### Key Insight: Pricing Has Collapsed

```
Grok 4.1 Fast output:     $3.20 / 1M tokens  (current)
DeepSeek V3 output:       $0.38 / 1M tokens  (8.4× cheaper)
Gemini 2.5 Flash-Lite:    $0.40 / 1M tokens  (8.0× cheaper)
ByteDance Seed 1.6:       $0.30 / 1M tokens  (10.7× cheaper)
```

**Grok 4.1 Fast is now 8–11× more expensive than equivalent-quality alternatives.**

---

## 3. Feature-by-Feature Swap Recommendations

### 3.1 Podcast Script Generation — **Biggest LLM Savings Target**

| Metric                 | Current (Grok 4.1 Fast) | Recommended (DeepSeek V3) | Alternative (Gemini 2.0 Flash) |
| ---------------------- | :---------------------: | :-----------------------: | :----------------------------: |
| Input cost/1M          |          $0.80          |           $0.25           |             $0.10              |
| Output cost/1M         |          $3.20          |           $0.38           |             $0.40              |
| Cost per 30-min script |         $0.096          |        **$0.013**         |           **$0.012**           |
| Quality (MMLU)         |          ~85%           |           88.5%           |              ~83%              |
| Context window         |          128K           |           128K            |               1M               |
| Savings                |            —            |          **86%**          |            **87%**             |

**Recommendation: Switch to DeepSeek V3 for podcast scripts.**

- Higher benchmark scores than Grok 4.1 Fast
- 86% cheaper per script
- At 1,000 users generating ~1,500 podcasts/month: **$144/mo → $19.50/mo** (saves $124.50)
- DeepSeek's cached input pricing ($0.14/1M) further reduces cost for continuation calls that reuse the same system prompt

**Code change:** In `lib/audioGenerator.ts`, update `modelsToTry`:

```typescript
const modelsToTry: ModelConfig[] = [
  { client: openrouter, model: "deepseek/deepseek-chat", name: "DeepSeek V3" }, // Primary: $0.25/$0.38
  {
    client: openrouter,
    model: "google/gemini-2.0-flash-exp:free",
    name: "Gemini Flash (free)",
  }, // Fallback: FREE
];
```

---

### 3.2 RAG Chat — **High Volume, Small Messages**

| Metric                       | Current (Grok 4.1 Fast) | Recommended (Gemini 2.5 Flash-Lite) | Alternative (DeepSeek V3) |
| ---------------------------- | :---------------------: | :---------------------------------: | :-----------------------: |
| Cost per message             |         $0.005          |             **$0.0004**             |        **$0.0005**        |
| Cost at 1K users (60 msg/mo) |          $300           |               **$24**               |          **$30**          |
| Context window               |          128K           |               **1M**                |           128K            |
| Savings                      |            —            |               **92%**               |          **90%**          |

**Recommendation: Switch to Gemini 2.5 Flash-Lite for RAG chat.**

- RAG chat doesn't require frontier reasoning — it's retrieval + summarization
- Gemini's 1M context window is a bonus for large notebooks
- At 1,000 users: **$300/mo → $24/mo** (saves $276)

**Code change:** In `lib/aiChat.ts` or equivalent:

```typescript
const chatModel = "google/gemini-2.5-flash-lite-preview-06-17"; // $0.10/$0.40
```

---

### 3.3 Entity Extraction (LightRAG) — **Already Cheap, Can Be Free**

| Metric            | Current (GPT-4o-mini) | Recommended (DeepSeek V3) | Free Alternative |
| ----------------- | :-------------------: | :-----------------------: | :--------------: |
| Cost per document |        $0.006         |        **$0.003**         |    **$0.00**     |
| Quality notes     |         Good          | Better (MMLU 88.5 vs 82)  |    Acceptable    |

**Recommendation: Switch to DeepSeek V3.**

- Better quality at half the price
- For budget mode: use OpenRouter free models (Gemini Flash free, DeepSeek R1 free) as fallback
- Savings at 1K users: ~$20/mo (small but compounds)

---

### 3.4 Slide Scripts & Video Narration — **GPT-4o Is Overkill**

| Metric                | Current (GPT-4o) | Recommended (DeepSeek V3) | Budget (Gemini Flash-Lite) |
| --------------------- | :--------------: | :-----------------------: | :------------------------: |
| Input cost/1M         |      $2.50       |           $0.25           |           $0.10            |
| Output cost/1M        |      $10.00      |           $0.38           |           $0.40            |
| Cost per video script |      $0.043      |        **$0.004**         |         **$0.003**         |
| Savings               |        —         |          **91%**          |          **93%**           |

**Recommendation: DeepSeek V3 for slide scripts.**

- Slide scripts are short, structured prompts — no need for GPT-4o's multimodal capabilities
- At 300 videos/mo: **$12.90 → $1.20** (saves $11.70)

---

### 3.5 Handbook Generation — **The Premium Pipeline**

This is the most quality-sensitive pipeline. Current cost: ~$0.20/handbook.

| Agent         |       Current Model       | Current Cost |        Recommended        |  New Cost  | Savings |
| ------------- | :-----------------------: | :----------: | :-----------------------: | :--------: | :-----: |
| Orchestrator  |   GPT-4-turbo ($10/$30)   |    $0.130    | DeepSeek V3 ($0.25/$0.38) | **$0.004** |   97%   |
| Structure     |    GPT-4o ($2.50/$10)     |    $0.060    |        DeepSeek V3        | **$0.003** |   95%   |
| Research      | GPT-4o-mini ($0.15/$0.60) |    $0.005    |   DeepSeek V3 (cached)    | **$0.002** |   60%   |
| Quality Check |        GPT-4o-mini        |    $0.005    |     Gemini Flash-Lite     | **$0.001** |   80%   |
| **Total**     |             —             |  **$0.200**  |             —             | **$0.010** | **95%** |

**Recommendation: Transition the entire handbook pipeline to DeepSeek V3.**

- DeepSeek V3 scores higher on MMLU (88.5%) than GPT-4o-mini (82%) and approaches GPT-4o (88%)
- The handbook orchestrator alone dropping from $0.13 to $0.004 is a **32× reduction**
- Risk: Test output quality before full migration

---

### 3.6 Flashcards, Quizzes, Mind Maps — **Perfect for Free Models**

These are short, structured generation tasks. Quality requirements are moderate.

| Task       | Current Cost |           Recommended Model            | New Cost  | Savings |
| ---------- | :----------: | :------------------------------------: | :-------: | :-----: |
| Flashcards |    $0.005    | Gemini 2.0 Flash (free via OpenRouter) | **$0.00** |  100%   |
| Quiz       |    $0.006    |        Gemini 2.0 Flash (free)         | **$0.00** |  100%   |
| Mind Map   |    $0.004    |        Gemini 2.0 Flash (free)         | **$0.00** |  100%   |

**Recommendation: Use free-tier models for all structured generation.**

- These outputs are JSON-structured and short — any competent model can handle them
- Free models have daily rate limits (~1,000 req/day); fall back to DeepSeek V3 if exceeded
- Savings at 1K users: ~$50/mo

---

## 4. Combined LLM Savings Projection

### Before vs After (1,000 Users)

| Feature                  | Current Monthly Cost | Optimized Monthly Cost |      Savings      |
| ------------------------ | :------------------: | :--------------------: | :---------------: |
| Podcast Scripts          |         $144         |         $19.50         |      $124.50      |
| RAG Chat                 |         $300         |          $24           |       $276        |
| Entity Extraction        |         $40          |          $15           |        $25        |
| Slide/Video Scripts      |         $13          |         $1.20          |      $11.80       |
| Handbook Generation      |         $40          |           $2           |        $38        |
| Flashcards/Quiz/Mind Map |         $50          |       $0 (free)        |        $50        |
| **TOTAL LLM**            |       **$587**       |       **$61.70**       | **$525.30 (89%)** |

### At Scale

| Scale  | Current LLM Cost | Optimized LLM Cost | Monthly Savings |
| :----: | :--------------: | :----------------: | :-------------: |
|  100   |       $59        |         $6         |       $53       |
| 1,000  |       $587       |        $62         |    **$525**     |
| 5,000  |      $2,935      |        $310        |   **$2,625**    |
| 10,000 |      $5,870      |        $620        |   **$5,250**    |

---

## 5. Implementation Priority & Risk Matrix

| Priority  | Change                                          | Savings (1K users) |          Risk           | Effort  |
| :-------: | ----------------------------------------------- | :----------------: | :---------------------: | :-----: |
| 🔴 **P0** | Swap Grok → DeepSeek V3 for podcast scripts     |     $124.50/mo     | Low (higher benchmarks) | 1 hour  |
| 🔴 **P0** | Swap Grok → Gemini Flash-Lite for RAG chat      |      $276/mo       |  Low (retrieval task)   | 1 hour  |
| 🟡 **P1** | Swap GPT-4o → DeepSeek V3 for slide scripts     |     $11.80/mo      |           Low           | 30 min  |
| 🟡 **P1** | Free models for flashcards/quiz/mind map        |       $50/mo       |        Very Low         | 30 min  |
| 🟡 **P1** | Swap GPT-4-turbo → DeepSeek V3 for handbook     |       $38/mo       |  Medium (test quality)  | 2 hours |
| 🟢 **P2** | Add semantic caching layer for repeated queries |     $50–100/mo     |           Low           | 4 hours |
| 🟢 **P2** | DeepSeek cached input for continuation calls    |       $20/mo       |           Low           | 1 hour  |

---

## 6. Recommended Model Hierarchy (Post-Optimization)

```
┌─────────────────────────────────────────────────────┐
│              MEMENTO MODEL STRATEGY                 │
├─────────────────────────────────────────────────────┤
│                                                     │
│  PRIMARY (95% of calls):                            │
│  ├── DeepSeek V3          $0.25/$0.38 per 1M       │
│  │   └── Podcast scripts, entity extraction,        │
│  │       handbook, slide scripts                    │
│  └── Gemini 2.5 Flash-Lite $0.10/$0.40 per 1M     │
│      └── RAG chat, quality checks                   │
│                                                     │
│  FREE TIER (structured generation):                 │
│  └── Gemini 2.0 Flash (free via OpenRouter)         │
│      └── Flashcards, quizzes, mind maps             │
│                                                     │
│  FALLBACK CHAIN:                                    │
│  DeepSeek V3 → Gemini Flash (free) → Grok 4.1 Fast │
│                                                     │
│  PREMIUM (BYOK users only):                         │
│  └── GPT-4o / Claude 3.5 (user's own key)           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 7. Total Platform Cost Impact (LLM + TTS Combined)

If we combine the LLM optimization with the TTS swap from the main Optimization Strategy:

| Component                             | Current (1K users) | Optimized (1K users) |     Savings      |
| ------------------------------------- | :----------------: | :------------------: | :--------------: |
| TTS (OpenAI → Unreal Speech)          |        $963        |         $64          |    $899 (93%)    |
| LLM (Grok/GPT → DeepSeek/Gemini)      |        $587        |         $62          |    $525 (89%)    |
| fal.ai Images                         |        $72         |         $72          |        $0        |
| Embeddings                            |        $15         |         $15          |        $0        |
| Infrastructure (R2, Supabase, Vercel) |        $65         |         $65          |        $0        |
| **TOTAL**                             |     **$1,702**     |       **$278**       | **$1,424 (84%)** |

**From $1.70/user/month down to $0.28/user/month** — an 84% reduction in unit economics.

---

## 8. Quality Safeguards

Before deploying these swaps, implement:

1. **A/B Testing Framework**: Run 10% of traffic through new models, compare user satisfaction scores
2. **Quality Regression Tests**: Generate 50 podcast scripts, 100 flashcard sets, 20 handbooks with each model and grade outputs
3. **Fallback Chain**: If DeepSeek V3 is down or rate-limited, fall back to Gemini Flash (free) → Grok 4.1 Fast
4. **User Feedback Loop**: Add a thumbs-up/down on generated content to track quality changes post-migration
5. **Gradual Rollout**: Start with low-risk features (flashcards, quiz) → medium-risk (chat, extraction) → high-risk (podcasts, handbooks)
