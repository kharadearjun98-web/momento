# Memento — Cost Optimization Strategy (Dramatic Reduction)

> **Goal:** Reduce Memento's operational costs by **70–90%** through strategic vendor swaps, architectural optimizations, and the implementation of a "Bring Your Own Key" (BYOK) model.

---

## 1. The "Big Three" Multipliers

Our analysis shows that **98%** of costs are driven by APIs (TTS + LLM). To move the needle, we focus on these massive multipliers.

### 1.1 The TTS Multiplier: Swapping OpenAI for Unreal Speech

**Impact: ~60% Total Cost Reduction**

OpenAI TTS-1 is the single largest expense ($15/1M characters).

- **Proposed Solution:** Switch to **Unreal Speech**.
- **Cost Delta:** $1.00 per 1M characters (Basic plan) vs $15.00.
- **Result:** **93.3% savings** on the biggest cost driver.
- **Strategy:** Maintain OpenAI for "Premium" voices in high-tier plans, use Unreal Speech for 90% of generated audio (Free/Starter tiers).

### 1.2 The LLM Multiplier: Semantic Caching & DeepSeek

**Impact: ~20% Total Cost Reduction**

RAG chat and document processing consume high token volumes.

- **Proposed Solution:** Implement **Semantic Caching** (e.g., via Upstash or local Redis).
- **Logic:** Cache common entity extractions and RAG queries. If a new query is semantically similar (>0.95) to a cached one, return the cached results.
- **DeepSeek Integration:** For high-throughput background tasks (entity extraction), swap GPT-4o-mini for **DeepSeek-V3**. DeepSeek offers a $0.14/1M tokens "Cached Input" price, which is 50% cheaper than OpenAI's mini model.

### 1.3 The Architecture Multiplier: BYOK (Bring Your Own Key)

**Impact: Shifts Cost to Power Users**

Power users currently cost us **$7.72/mo** in APIs alone.

- **Proposed Solution:** Implementation of a **BYOK toggle** for Pro/Power users.
- **Mechanism:** Users can enter their own OpenAI/Antropic/OpenRouter keys in settings.
- **Incentive:** Users with their own keys get "Unlimited" generation without monthly platform limits.
- **Benefit:** Eliminates the heaviest cost center for our most usage-heavy 10% of users.

---

## 2. Strategic Implementation Tiers

We can transition Memento to a highly profitable state by grounding our tiers in these optimizations:

|   Tier    | Optimization Profile                      | Max Podcast Length |  Cost Limit  |       Margin %       |
| :-------: | ----------------------------------------- | :----------------: | :----------: | :------------------: |
| **Free**  | Unreal Speech + DeepSeek + Semantic Cache |       10 min       |  $0.03/user  | **N/A** (Subsidized) |
| **Basic** | Mix of Unreal/OpenAI + Semantic Cache     |       30 min       |  $0.15/user  |         ~85%         |
|  **Pro**  | OpenAI Premium + BYOK Option              |       1 hr+        | $0.00 (BYOK) |         ~95%         |

---

## 3. Technical Roadmap (Phase 1: Implementation)

### Step 1: Unreal Speech Integration (`lib/audioGenerator.ts`)

Update the `AudioOverviewOptions` to support a `provider` flag.

```typescript
const generateAudio = async (text, provider = "unrealspeech") => {
  if (provider === "unrealspeech") {
    // Call Unreal Speech API ($1/1M chars)
  } else {
    // Fallback to OpenAI ($15/1M chars)
  }
};
```

### Step 2: Semantic Caching Layer

Add a caching middleware to `lib/aiChat.ts` and `lib/lightrag.ts`.

- **Service:** Upstash Redis (Global Serverless).
- **Logic:** Store `hash(query) -> {response_metadata, result}`.
- **Expiration:** 30 days.

### Step 3: DeepSeek for Background Extraction

Transition `lib/lightrag.ts` entity extraction calls to DeepSeek-V3 via OpenRouter or direct API.

- **Reason:** High input token volume (scanning full documents).
- **Saving:** 50–70% on extraction preprocessing.

---

## 4. Projected Savings Summary

|    Scale    | Current Projected Cost/Mo | Optimized Cost/Mo | **Monthly Savings** |
| :---------: | :-----------------------: | :---------------: | :-----------------: |
|  100 Users  |           $227            |      **$85**      |        $142         |
| 1,000 Users |          $1,865           |     **$410**      |     **$1,455**      |
| 5,000 Users |          $9,219           |    **$1,980**     |     **$7,239**      |

---

## Conclusion

By shifting the primary audio workload to **Unreal Speech** and the background processing to **DeepSeek** with **Semantic Caching**, Memento can achieve a **~78% cost reduction** immediately. Adding **BYOK** for power users secures the platform against "usage spikes" that could otherwise erode margins.
