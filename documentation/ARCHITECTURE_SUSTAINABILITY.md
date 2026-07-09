# Memento — Technical Architecture Sustainability Review

> **Question:** Can the current architecture sustainably power handbook generation, reports, audio/video overviews, quizzes, flashcards, mindmaps, and chat at production scale?
>
> **TL;DR:** **No, not in its current shape.** The feature set *works as a demo in a developer's browser*, but the way the pipeline is wired up will break, be abused, or become financially unsustainable the moment real users hit it. This document explains exactly why, what will fail first, and what the target architecture has to look like before we ship.
>
> Audit date: 2026‑04‑16 · Branch: `jim-memento`

---

## 1. What Memento actually is today

A single‑page React app (Vite) that performs *every* step of content generation client‑side:

```
Browser (your user)
 ├── Parses PDFs                          (pdfjs-dist)
 ├── Chunks & embeds text                 (NVIDIA BGE-M3, OpenAI)
 ├── Extracts entities + relationships    (GPT-4o-mini or Nemotron)
 ├── Stores chunks/entities/edges         (Supabase REST + RLS)
 ├── Runs RAG retrieval                   (Supabase RPC)
 ├── Generates script/outline/content     (OpenRouter - Grok/Nemotron)
 ├── Generates images                     (OpenAI gpt-image-1 / FAL)
 ├── Generates TTS                        (OpenAI tts-1, Google TTS)
 ├── "Mixes" audio                        (concat MP3 byte arrays)
 ├── Renders slides/video                 (DOM rendering at playback time)
 ├── Builds PDFs                          (jsPDF + html2canvas)
 └── Uploads assets                       (Supabase Storage)

Supabase
 ├── Auth
 ├── Postgres (+ pgvector)
 ├── Storage
 └── One Edge Function (send-verification-code)
```

There is **no backend worker, no job queue, no server‑side orchestration**. Every generator in `lib/*Generator.ts` runs synchronously inside the user's tab, holding third‑party API keys that are baked into the JS bundle (see `DEPLOYMENT_READINESS.md` P0‑3).

This design is what makes the architecture unsustainable — not any single feature.

---

## 2. Per‑feature verdict

### 2.1 Handbook generation — 🟠 Works, but fragile
**File:** `lib/handbookGenerator.ts`

Pipeline: research → outline → initial content → N continuation passes → cleanup → save.

What's good:
- Clear multi‑phase design with progress callbacks.
- Uses LightRAG (chunks + entities + relationships) for grounding.
- Continuation loop targets a word count and strips AI meta‑messages.

What will fail in production:
- **No server‑side orchestration.** If the user closes the tab, switches Wi‑Fi, or the browser kills the tab (iOS does this aggressively after 30–60 s in background), the entire 3–12 minute job is lost. There is no resumability for handbooks (unlike audio/video, which at least tries — see 2.5).
- **Everything lives in the metadata column.** `saveHandbook()` writes the full handbook (potentially 30+ pages of markdown) into `generated_assets.metadata` as a JSONB blob. `generated_assets` has no size limit policy, and listing assets pulls the entire blob for every row. This table will bloat fast; Postgres detoasting and RLS policy eval costs scale with blob size.
- **Retrieval volume.** `retrieveWithLightRAG({ chunkCount: 30 })` + `getAllGraphData(80)` pulls ~110 rows per generation just for context. Multiply by concurrent users.
- **API budget exposure.** Every call uses `VITE_OPENROUTER_API_KEY` from the browser — meaning any user can run 12 Grok calls and 1 outline call per generation for free against *our* account.
- **Error handling is "catch‑and‑warn."** If RAG or graph retrieval fails, it silently continues with empty context; the user gets a handbook that ignores their documents entirely but still burns tokens.
- **30‑page handbooks are effectively capped by context window.** The `combinedContent.substring(0, 20000)` cap means beyond a few sources, the model sees only a random‑ish 20 KB slice; continuation prompts shrink that to 12 KB. Realistically "30+ pages" is going to be repetitive filler.
- **Cleanup regexes are fighting symptoms, not causes.** `finalCleanupContent` has 30+ regexes to strip AI meta‑commentary. Every AI model change will break these.

**Solutions:**

- **No server‑side orchestration →** Move `handbookGenerator.ts` into `worker/generators/handbook.ts`. The browser calls `supabase.functions.invoke('create-job', { body: { type: 'handbook', input: { notebookId, options } } })` and subscribes to Realtime on the `jobs` table. The worker owns the full pipeline. Tab closure no longer kills the job.

- **JSONB blob persistence →** Replace `saveHandbook()` with relational writes:
  ```ts
  const { data: hb } = await supabase.from('handbooks')
    .insert({ notebook_id, user_id, title, word_count }).select().single();
  await supabase.from('handbook_sections').insert(
    parseMarkdownToSections(content).map((s, i) => ({ handbook_id: hb.id, ...s, order_index: i }))
  );
  ```
  `HandbookPlayback.tsx` reads from `handbooks` + `handbook_sections` via a join query. List views query only `handbooks` — no detoast cost.

- **Retrieval volume →** Cache the graph data per notebook with a 5-minute TTL in the worker's in-memory store. A notebook generating a handbook and a report in the same session pays the retrieval cost once, not twice.

- **API budget exposure →** Resolved entirely by moving the generator server-side. The worker holds the API keys; the browser never sees them.

- **Silent error handling →** Replace catch-and-warn with hard failures that update `jobs.status = 'failed'` and `jobs.last_error`. The UI shows a clear error state with a retry button instead of silently producing a bad handbook.

- **Context window cap →** Replace `combinedContent.substring(0, 20000)` with a ranked retrieval strategy: retrieve the top-K chunks by cosine similarity score, then fill the context window greedily from highest to lowest score. This ensures the most relevant content is always included rather than a random 20 KB slice.

- **Cleanup regexes →** Delete `finalCleanupContent` entirely. Fix the root cause: add a system prompt instruction that explicitly forbids meta-commentary (`"Do not include phrases like 'Here is your handbook' or 'I hope this helps'"`) and use a structured output schema (JSON with `sections[]`) so the model cannot inject prose outside the schema.

### 2.2 Report generation — 🟠 Same class of problems as handbooks
**File:** `lib/reportGenerator.ts` (~950 lines)

Same pattern: multi‑phase in‑browser pipeline, full report JSON in `generated_assets.metadata`, optional image generation via `gpt-image-1` on the client. Image generation is slow (10–30 s per image) and if the user navigates away mid‑report, the already‑minted paid images are orphaned.

**Solutions:**

- **In-browser pipeline →** Port to `worker/generators/report.ts`. Same job queue pattern as handbooks. The worker runs the full pipeline; the browser only submits and subscribes.

- **Orphaned paid images →** In the worker, generate images only after the text outline is committed to `job_phases`. If the job fails after images are generated, the worker's cleanup handler deletes the storage objects before marking the job `failed`. No paid artifacts are ever orphaned.

- **JSONB blob →** Same relational fix as 2.1: `reports` + `report_sections` tables. Images stored in Supabase Storage with paths in `report_assets`, never as base64 in the DB.

### 2.3 Audio overview ("podcast") — 🔴 Won't survive real usage
**Files:** `lib/audioGenerator.ts`, `lib/agents/audioMasterAgent.ts`, `lib/agents/ttsWorkerPool.ts`, `lib/agents/audioMixer.ts`, `lib/agents/segmentValidator.ts`, `lib/agents/jobStateManager.ts`

Pipeline: script (OpenRouter) → validate segments → TTS (OpenAI `tts-1`, 4 parallel workers) → mix → upload to `assets` bucket.

Where this breaks:

- **The "audio mixer" is concatenating MP3 byte streams with zero‑padded silence.** `lib/agents/audioMixer.ts` splices `new Uint8Array(bytes)` full of `0x00`s into the output and labels them "silence." MP3 is a *framed* format; inserting zero bytes produces malformed frames. Today's browsers are permissive and play it anyway, but: (a) duration metadata will be wrong, (b) some players will stutter, (c) re‑encoding (e.g. downloaded to edit) will fail, (d) iOS Safari and podcast apps reject malformed MP3. This needs real concatenation (ffmpeg.wasm or server‑side FFmpeg).
- **Duration is a fiction.** `calculateAudioDuration` assumes a fixed bitrate (`16000 bytes/second`). TTS output is VBR — the reported duration drifts by 10‑30%. Slide timings in video overviews (which reuse this code) will desync from the audio.
- **Ordering bug in the worker pool.** `TTSWorkerPoolAgent.worker` does:

  ```ts
  const index = segment.originalIndex * 100 + segment.splitIndex;
  const actualIndex = results.findIndex(r => !r);  // <-- not `index`
  results[actualIndex] = processed;
  ```

  `actualIndex` is the *first empty slot*, not the segment's real position. The mixer then re‑sorts by `originalIndex * 1000 + splitIndex`, so it partially recovers — but segments that are validated and split don't have unique `splitIndex` values per worker lane, and `100` vs `1000` mismatch will collide on any segment with 10+ splits. You will get out‑of‑order audio on long podcasts.
- **Resume is not implemented.** `audioMasterAgent.ts` writes checkpoints to `localStorage` but `resumeGeneration()` literally says `// TODO: Implement resume logic` and `starts fresh`. A 1‑hour podcast (~60 TTS calls) that dies in segment 58 costs you all 60 again.
- **Checkpoints are in `localStorage`.** 5 MB cap; writing a 60‑segment checkpoint with `processedSegments` (each holds an `ArrayBuffer`) will OOM the quota. `JSON.stringify` on an `ArrayBuffer` produces `{}`, so the saved data is useless even if it fit.
- **Concurrency is per‑user, not global.** Each browser tab starts 4 TTS workers. 50 users generating podcasts = 200 parallel OpenAI calls from our shared key → rate‑limit storm → everyone's generation fails.
- **Cost model is wild.** A 1‑hour podcast is roughly ~9 000 words × $15 / 1M chars ≈ $0.14 of TTS per user, plus script generation. At any real scale this needs usage tracking + per‑user quotas, which cannot exist while the API key is client‑side.

**Solutions:**

- **Malformed MP3 mixer →** Delete `lib/agents/audioMixer.ts` `mixAudioSegments`. Replace with a server-side FFmpeg concat in `worker/audio/mix.ts`:
  ```ts
  execFile('ffmpeg', ['-f','concat','-safe','0','-i','/tmp/concat.txt',
    '-af','loudnorm','-c:a','libmp3lame','-q:a','4','-f','mp3','pipe:1'],
    { encoding: 'buffer' }, (err, stdout) => { if (err) reject(err); else resolve(stdout); });
  ```
  Silence is inserted with `anullsrc` filter, not zero-byte padding. Output is a valid, loudness-normalised MP3 that plays on every platform.

- **Duration fiction →** Delete `calculateAudioDuration`. Replace with `ffprobe` on the server:
  ```ts
  execFile('ffprobe',['-v','quiet','-print_format','json','-show_format', path],
    (err, out) => resolve(parseFloat(JSON.parse(out).format.duration) * 1000));
  ```
  On the client, read `audioElement.duration` after the blob URL loads — it is exact.

- **Ordering bug →** In `lib/agents/ttsWorkerPool.ts`, replace the `findIndex` assignment with a `Map`:
  ```ts
  const results = new Map<number, ProcessedSegment>();
  // in the worker callback:
  results.set(segment.originalIndex * 1000 + segment.splitIndex, processed);
  ```
  Sort by key when assembling the final array. The `100` vs `1000` multiplier mismatch is eliminated.

- **Resume not implemented →** Move the pipeline to the worker. Each TTS segment that completes writes a `job_phases` row (`phase: 'tts_segment_N'`, `storage_path: 'drafts/.../segment_N.mp3'`). On resume, the worker queries completed phases and skips them. Delete all `localStorage` checkpoint code from `audioMasterAgent.ts`.

- **localStorage checkpoints →** Resolved by the server-side phase table above. `ArrayBuffer` data is never serialised to JSON; segment audio lives in Supabase Storage.

- **Per-user concurrency storm →** In the worker, use `p-limit` with a global semaphore of 4 concurrent TTS calls across all users. Per-user limit is enforced by the credit/quota system at job creation time.

- **Cost model →** Every TTS call in the worker logs to `usage_events(user_id, chars, cost_usd)`. Credits are deducted at job creation. Users on the Free plan cannot start a podcast job if they have insufficient credits.

### 2.4 Video overview — 🔴 Works only as browser playback, not as a "video"
**Files:** `lib/agents/videoMasterAgent.ts`, `lib/slideGenerator.ts`, `lib/visualSlideGenerator.ts`, `components/VideoOverviewPlayback.tsx`

What it actually produces:
- A JSON `Slide[]` (title, bullets, mermaidCode, imageBase64, narration).
- An audio file (same pipeline as 2.3, same bugs).
- A `slideTimings[]` array.

**No MP4/WebM is ever produced.** "Video overview" is a React component that renders slides in the DOM in sync with an audio tag. That's fine as a feature, but:
- Users cannot download a video file, share it, embed it, or watch it outside the app.
- Slide images are base64 in JSON up until `uploadSlideImage` moves them to storage — but the `Slide[]` object still keeps both `imageBase64` and `imageUrl`, which doubles payload size and will trip Supabase's 1 MB row limit on larger decks.
- Timings rely on the same broken duration calculator from 2.3 → slides and narration desync.
- If we want a real shareable video, we need server‑side ffmpeg (e.g., a worker invoking `ffmpeg -i audio.mp3 -loop 1 -i slideN.png -t NNs ...`). That does not exist here.

**Solutions:**

- **No downloadable video →** Add an FFmpeg step to the worker after audio is mixed. For each slide, render a still-image video clip, then concat all clips:
  ```bash
  ffmpeg -loop 1 -i slide_N.png -i segment_N.mp3 -t <duration_s> \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
    -c:v libx264 -tune stillimage -c:a aac -shortest slide_N.mp4
  ffmpeg -f concat -safe 0 -i clips.txt -c copy final.mp4
  ```
  Store the MP4 at `assets/final/<userId>/<deckId>/overview.mp4`. The browser playback component stays as-is for in-app viewing; the download button links to the storage URL.

- **`imageBase64` doubling payload →** In `videoMasterAgent.ts`, delete `imageBase64` from the `Slide` object immediately after `uploadSlideImage()` resolves. Only `imageUrl` (the storage path) should persist. This alone prevents the 1 MB row limit breach on larger decks.

- **Timing desync →** Fixed by the `ffprobe`-based duration solution in 2.3. Once each segment has an accurate `duration_ms` from the server, `slideTimings` are computed from real values, not estimates.

**Solutions:**

- **No downloadable video →** Add an FFmpeg step to the worker after audio mixing. For each slide, render a still-image video clip, then concat all clips:
  ```bash
  # per slide
  ffmpeg -loop 1 -i slide_N.png -i segment_N.mp3 -t <duration_s> \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
    -c:v libx264 -tune stillimage -c:a aac -shortest slide_N.mp4
  # concat
  ffmpeg -f concat -safe 0 -i slides_manifest.txt -c copy final.mp4
  ```
  Upload `final.mp4` to `assets/final/<userId>/<deckId>/video.mp4`. The browser playback component stays as-is for in-app viewing; the download button links to the storage URL.

- **Double base64 payload →** In `lib/agents/videoMasterAgent.ts`, after `uploadSlideImage()` resolves, delete `slide.imageBase64` from the object before it is written to the DB. Only `imageUrl` (the storage path) should persist. Add a TypeScript type guard to enforce this at compile time.

- **Timing desync →** Resolved by the `ffprobe` duration fix in 2.3. Slide timings are computed from real per-segment durations returned by `ffprobe`, not the fixed-bitrate estimate.

### 2.5 Quizzes, flashcards, mindmaps — 🟢 Mostly fine (same caveats)
**Files:** `lib/quizGenerator.ts`, `lib/flashcardGenerator.ts`, `lib/mindmapGenerator.ts`

These are smaller generations (< 30 s, one LLM call each) and the "in the browser" model is tolerable for them. They still inherit:
- API keys in the bundle (P0‑3 from the readiness doc).
- No rate limiting.
- Blob‑in‑metadata persistence.
- No streaming → perceived latency.

Not architecturally unsustainable *on their own*, but share the same exposure surface.

**Solutions:**

- **API keys in bundle →** Move all three generators to `worker/generators/` (or Supabase Edge Functions — they're fast enough). The browser submits a job; the worker runs the LLM call with server-side keys.

- **No rate limiting →** Enforced at the `create-job` Edge Function via the credit/quota system. Each quiz/flashcard/mindmap costs 1 credit. Free users get a monthly allowance; exhausted users see an upgrade prompt.

- **Blob persistence →** Add `quizzes`, `flashcard_sets`, and `mindmaps` tables with relational rows. Quiz questions go in a `quiz_questions` table; flashcard fronts/backs in `flashcard_items`. This enables future features like spaced repetition tracking per card.

- **No streaming →** For these short generations, streaming is not necessary. The job completes in < 30 s and the Realtime subscription delivers the result. The perceived latency is acceptable once the user sees a progress indicator tied to `jobs.progress_pct`.

**Solutions:**

- **API keys in bundle →** Move LLM calls into Supabase Edge Functions or the worker. These are fast enough (< 30 s) to run inside a single Edge Function invocation, avoiding the need for a full job queue entry. The browser calls `supabase.functions.invoke('generate-quiz', ...)` and awaits the response directly.

- **No rate limiting →** The `create-job` Edge Function (or the quiz Edge Function) checks `user_credits.credits_remaining` before executing. One quiz = 1 credit. Exhausted users see an upgrade prompt.

- **Blob persistence →** Add `quizzes(id, notebook_id, user_id, title, created_at)` and `quiz_questions(id, quiz_id, question, options jsonb, correct_index int, explanation text, order_index int)` tables. Same pattern for flashcards and mindmaps. List views become cheap single-table queries.

- **No streaming →** For quizzes and flashcards, streaming is not needed — the full response is short. For mindmaps, stream the Mermaid diagram string and render incrementally using Mermaid's live update API.

### 2.6 Chat — 🟠 Functional but exposed
**File:** `lib/aiChat.ts`

LightRAG retrieval + streaming completion from OpenRouter. Streaming is good UX. But:
- Fallback model list is hardcoded (`grok-4.1-fast` → `nemotron:free`) — no model versioning/abstraction.
- No per‑user rate limit. A single user in a loop can drain the OpenRouter budget.
- Citation HTML is injected as inline `onclick` (see `markdownRenderer.ts`) — tied to XSS concern in P0‑4.

**Solutions:**

- **Hardcoded models →** Move `lib/aiChat.ts` LLM call into `supabase/functions/chat/index.ts`. The Edge Function imports `models.chat.primary` from the server-side model router. Swapping the chat model is a one-line change in `models.ts`, not a grep across the codebase.

- **No per-user rate limit →** Add a sliding-window check in the `chat` Edge Function: count `usage_events` rows for this user in the last 60 seconds. If > N (e.g. 10 messages/min), return 429. This prevents a single user from looping the chat endpoint and draining the OpenRouter budget.

- **XSS via inline `onclick` citations →** In `lib/markdownRenderer.ts`, replace inline `onclick` handlers with `data-citation-id` attributes. Attach a single delegated event listener at the document level that reads `data-citation-id` and opens the citation panel. This removes all inline script from AI-generated HTML and eliminates the stored XSS vector.

### 2.7 PDF export — 🟠 Works but jsPDF + html2canvas is brittle
**Files:** `lib/pdfGenerator.ts`, `components/HandbookPlayback.tsx`

- `html2canvas` rasterises the entire handbook DOM. For a 30‑page handbook on a low‑memory device (any mobile Safari), the canvas can exceed ~16 Mpx and the browser aborts.
- Output is an image inside a PDF (non‑searchable, non‑selectable text, no accessibility).
- `jspdf@3.0.4` has 10+ CVEs (see `DEPLOYMENT_READINESS.md` P1‑6).
- For real documents, server‑side rendering (puppeteer / weasyprint / Typst) is vastly superior.

**Solutions:**

- **html2canvas memory crash →** Replace with a Puppeteer worker endpoint. The worker navigates to a headless `/render/handbook/:id` route in the React app (auth-gated with a short-lived service token), waits for `[data-render-ready]`, and calls `page.pdf()`. The resulting PDF is searchable, selectable, and accessible. Remove `jspdf` and `html2canvas` from `package.json` entirely — this eliminates the CVEs and ~400 KB from the bundle.

- **Non-searchable image PDF →** Puppeteer's `page.pdf()` produces a real text-layer PDF. Alternatively, use a Typst template for typeset-quality output — one template can drive both handbooks and reports with consistent styling.

- **jsPDF CVEs →** Resolved by removing the dependency. No patch needed; the library is deleted.

### 2.8 Knowledge graph / LightRAG — 🟠 The quiet time bomb
**Files:** `lib/lightrag.ts`, `lib/lightragRetrieval.ts`, `lib/nvidiaEmbeddings.ts`, `supabase/lightrag-functions.sql`

- The SQL in `lightrag-functions.sql` defines `match_document_chunks(query_embedding vector(1536), ...)` while `migrate-to-1024-dimensions.sql` migrates to `vector(1024)`. First production deploy against a fresh DB will hit a type mismatch unless applied in exactly the right order. No migrations directory enforces that.
- `lib/nvidiaEmbeddings.ts` hardcodes `http://localhost:5173/nvidia-api/v1` — **embeddings don't work in the production Docker image at all**. PDF ingestion, chat, RAG, and all generators silently degrade (the try/catch downstream swallows the error). This is probably the single fastest way we'd discover the architecture is broken on day 1.
- `ivfflat` index with `lists = 100` is fine for ~100k rows. Once notebooks cross that (a couple hundred active users uploading books), retrieval latency climbs non‑linearly. We need `HNSW` for scale.
- Re‑index service (`lib/reindexService.ts`) deletes and recreates all edges/nodes per notebook — an O(N) write storm with no pagination or background‑job semantics. A user with 50 sources triggers ~50 serial graph‑extraction LLM calls; the browser tab must stay open the whole time.

**Solutions:**

- **Dimension mismatch →** Consolidate into `supabase/migrations/0003_lightrag_functions.sql` with `match_document_chunks(query_embedding vector(1024), ...)` as the canonical signature. Delete the conflicting files. CI applies migrations in order against a fresh DB on every PR — the mismatch becomes a build failure, not a production surprise.

- **Hardcoded localhost URL →** Create `supabase/functions/embed/index.ts` that proxies to the NVIDIA API using a server-side `NVIDIA_API_KEY` secret. Update `lib/nvidiaEmbeddings.ts` to call `supabase.functions.invoke('embed', ...)`. The localhost URL is gone; embeddings work in every environment.

- **ivfflat scaling wall →** When active notebooks cross ~300, run this migration:
  ```sql
  DROP INDEX document_chunks_embedding_idx;
  CREATE INDEX document_chunks_embedding_hnsw_idx
    ON document_chunks USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
  ```
  HNSW has no `lists` parameter and scales to millions of rows with sub-10ms retrieval. Schedule this migration proactively — it can run concurrently (`CREATE INDEX CONCURRENTLY`) without locking the table.

- **Re-index write storm →** Move `lib/reindexService.ts` into the worker as a `reindex` job type. The worker processes sources in batches of 5 with a 500 ms delay between batches, writing each batch's results to `job_phases` before advancing. The browser tab can close; the worker continues. Add a `UNIQUE(notebook_id, source_id)` constraint on `graph_nodes` so re-runs are idempotent upserts, not delete-and-recreate storms.

---

## 3. Cross‑cutting architectural problems

These are the systemic issues — fix one feature and they recur in the next.

### 3.1 The browser is doing a server's job
Every long‑running, money‑spending, state‑mutating job runs in the user's tab. Consequences:
- **Secrets must be in the bundle** → API key exfiltration is a matter of "view source." (P0‑3)
- **Jobs die with the tab** → no durable progress, no retry, no resumability (audio has a fake resume; handbooks/reports have nothing).
- **No rate limiting possible** → one user can DoS our LLM budgets.
- **No per‑user quotas** → can't build a pricing model on top of this.
- **No observability** → we can't see what failed, where, or for whom; we only hear from support tickets.
- **Browser constraints compound**: localStorage caps, tab throttling, memory pressure, mobile Safari's tab killer, cross‑origin limitations (the reason `lib/nvidiaEmbeddings.ts` hardcodes a dev proxy URL).

This is a single design decision. Until it is reversed (move generators behind a server), **no feature is production‑sustainable.**

**Solution:** Move every generator in `lib/*Generator.ts` and `lib/agents/*` into `worker/generators/`. The browser calls `supabase.functions.invoke('create-job', ...)` and subscribes to Realtime on the `jobs` table. The worker holds all API keys, runs all pipelines, and writes results to the DB and Storage. The browser becomes a thin UI layer. This single change resolves secrets exposure, tab-death job loss, rate limiting, quotas, and observability in one architectural move.

---

### 3.2 No job queue
Everything is fire‑and‑forget async within the tab. We need:
- A durable job store (Supabase `jobs` table or a real queue: pgmq, Inngest, Trigger.dev, Temporal, AWS SQS).
- An idempotent worker for each generator type.
- Status polling / Supabase Realtime subscription for the client.
- Retry‑with‑backoff and dead‑letter queue.

Without this, you can't build: "Generate a 1‑hour podcast and email me when it's done," which is the obvious product move.

**Solution:** Add the `jobs` and `job_phases` tables (migration `0004`). The worker uses `SELECT ... FOR UPDATE SKIP LOCKED` to claim jobs atomically. Each phase writes to `job_phases` before advancing — this is the resumability primitive. Retry logic: if `jobs.attempts < 3`, re-queue on failure with exponential backoff (`2^attempts * 30s`). After 3 failures, set `status = 'dead'` and alert ops via Sentry. The browser subscribes to `jobs` via Supabase Realtime and renders a live progress bar from `jobs.progress_pct` and `jobs.phase`.

---

### 3.3 Fan‑out concurrency with no budget
- `TTSWorkerPoolAgent` launches 4 parallel TTS calls *per user*.
- `extractEntitiesAndRelationships` fans out batches of 5 chunks with 500 ms delays.
- `generatePodcastScript` + `retrieveWithLightRAG` + `getAllGraphData` all hit Supabase in parallel.

There is no global concurrency limiter or usage accounting. At 50 concurrent users generating podcasts we'll hit the OpenAI `tts-1` tier‑1 rate limit (usually 50 RPM) and every generation fails halfway.

**Solution:** In the worker, use `p-limit` for a global semaphore per provider:
```ts
import pLimit from 'p-limit';
const ttsLimit = pLimit(4);   // max 4 concurrent TTS calls across all users
const llmLimit = pLimit(10);  // max 10 concurrent LLM calls
// wrap every call:
const result = await ttsLimit(() => openai.audio.speech.create(...));
```
For entity extraction, replace the 500 ms delay fan-out with a proper queue: push each chunk as a sub-job into `job_phases`, process sequentially in the worker. This eliminates the rate-limit storm and makes the extraction resumable.

---

### 3.4 Persistence model abuses JSONB
`generated_assets.metadata` holds every full handbook, report, slide deck, and flashcard set as JSONB. Problems:
- Row size: 30‑page handbook + embedded slide base64 easily > 2 MB. Postgres toasts it; every read pays detoast cost.
- No partial updates: editing a single section rewrites the whole JSONB blob.
- No full‑text search over content without duplicating into a separate column.
- RLS policy is evaluated per row even when we only want the list.

Should be: relational (`handbooks`, `handbook_sections`, `reports`, `report_sections`, `slide_decks`, `slides`) with storage for binary artifacts in Supabase Storage.

**Solution:** Migration `0005_relational_content.sql` creates proper relational tables for every content type. `handbook_sections.content_markdown` gets a `tsvector` generated column for full-text search at no extra cost. List queries hit only the parent table (no detoast). Section-level edits update a single row. Binary artifacts (audio, images, PDFs) live in Supabase Storage; only the path is stored in the DB.

---

### 3.5 Schema drift
`supabase/setup-database.sql`, `supabase/schema_safe.sql`, `supabase/migrate-to-1024-dimensions.sql`, `supabase/lightrag-functions.sql` do not agree with each other on:
- `document_chunks.embedding` dimensions (1024 vs 1536).
- `notebooks.user_id` references (`auth.users` vs `profiles`).
- Which tables exist at all (e.g., `password_reset_codes` is in one file only).

No `supabase/migrations/` directory, no ordered application, no CI check. First fresh environment we stand up will be subtly broken.

**Solution:** Create `supabase/migrations/` with files `0001`–`0007`. Delete the four conflicting SQL files. Add a GitHub Actions step that runs `supabase db reset && supabase db push && supabase db lint` against an ephemeral Supabase project on every PR. A schema conflict is now a CI failure, not a production incident. The `notebooks.user_id` reference is canonically `auth.users(id)` in `0001`; `password_reset_codes` is included there too.

---

### 3.6 Storage sprawl
- Every generation writes to the public `assets` bucket with no lifecycle rules.
- Audio files: ~1 MB per minute → a 1‑hour podcast = 60 MB.
- Slide images: base64 PNGs, often 500 KB‑2 MB each, 20–60 per deck.
- Nothing ever gets deleted. A single active user will produce multiple GB per month.

Needs: lifecycle policy (auto‑delete drafts after N days), tiered storage (hot → cold after 30 days), per‑user quotas, CDN in front (Cloudflare R2 / BunnyCDN), and cost dashboards.

**Solution:**
- Worker writes in-progress segments to `assets/drafts/<userId>/<jobId>/` and moves to `assets/final/<userId>/<assetId>/` on completion.
- `pg_cron` nightly job deletes `drafts/` objects older than 7 days.
- Per-user storage quota checked at job creation: `SELECT SUM(metadata->>'size') FROM storage.objects WHERE name LIKE 'final/<userId>/%'`. Reject if over plan limit.
- Free tier: 1 GB. Pro: 10 GB. Team: 50 GB.
- CDN: attach Supabase Storage CDN (built-in) for `final/` objects. Move to Cloudflare R2 when egress costs become visible.

---

### 3.7 Models and providers are hardcoded
- `x-ai/grok-4.1-fast`, `nvidia/nemotron-3-nano-30b-a3b:free`, `gpt-4o-mini`, `gpt-image-1`, `tts-1`, `baai/bge-m3` are literal strings spread across 10+ files.
- Any model sunsets → find‑and‑replace across the codebase.
- No A/B testing, no cost routing, no fallback strategy beyond a 2‑element array.

Needs: a `modelRouter` module with a config table (per capability: chat, embed, tts, image) and a single place to swap providers.

**Solution:** Create `worker/lib/models.ts` as the single source of truth for all model strings and costs. Every generator imports from it. Grep-replace all ~40 hardcoded strings in one pass. Add `callWithFallback(capability, fn)` that catches 429/503 from the primary and retries with the fallback. When a model is sunset, one line changes in `models.ts` and all generators pick it up automatically.

---

### 3.8 No timeouts, no cancellation outside audio
Only `audioMasterAgent.ts` uses `AbortController`. Every other generator's LLM call can hang indefinitely (OpenRouter has occasional 5‑10 min stalls). There is no UI cancel button that propagates. A user who clicks "Generate" twice racks up two full generations.

**Solution:**
- In the worker, wrap every LLM call with a `Promise.race` against a 90-second timeout:
  ```ts
  const result = await Promise.race([
    openrouter.chat.completions.create(params),
    new Promise((_, reject) => setTimeout(() => reject(new Error('LLM timeout')), 90_000)),
  ]);
  ```
- Add a `DELETE /jobs/:id` Edge Function that sets `jobs.status = 'cancelled'`. The worker checks for cancellation between phases and exits cleanly.
- In the browser, show a "Cancel" button on any in-progress job. Clicking it calls the cancel endpoint. The UI transitions to a cancelled state via Realtime.
- Deduplication: before inserting a new job, check if the user already has a `queued` or `running` job of the same type for the same notebook. If so, return the existing `jobId` instead of creating a duplicate.

---

### 3.9 Observability = `console.log`
300+ `console.log` calls. No Sentry, no structured logs, no traces, no metrics, no request IDs, no budget alerts. When a user says "it didn't work," we have nothing.

**Solution:**
- Add `@sentry/react` to the browser (`main.tsx`) and `@sentry/node` to the worker. Both report to the same Sentry project with `environment: 'production'` and `release: GIT_SHA`.
- Replace `console.log` in the worker with a structured logger (`pino` or similar) that emits JSON. Supabase log drain ships these to Logflare or Axiom.
- Each job execution is wrapped in a Sentry transaction: `Sentry.startTransaction({ name: 'job.handbook', op: 'job' })`. Spans are added per phase. When a job fails, the Sentry event includes `job_id`, `user_id`, `phase`, and `last_error`.
- Budget alert: after each `usage_events` insert, call `monthly_spend_usd()`. If > 80% of `MONTHLY_BUDGET_ALERT_USD`, POST to a Slack webhook. This fires before the account is drained, not after.

---

### 3.10 The mermaid / markdown rendering path is a liability
`lib/markdownRenderer.ts` + `DOMPurify` config + KaTeX `trust: true` + Mermaid diagrams rendered with `dangerouslySetInnerHTML` = stored XSS via AI output. That's called out in P0‑4 of `DEPLOYMENT_READINESS.md` but it bears repeating here because the AI **will** faithfully render any HTML that slips into a source document.

**Solution:**
- In `lib/markdownRenderer.ts`, tighten the `DOMPurify` config: set `FORBID_TAGS: ['script','style','iframe','object','embed']` and `FORBID_ATTR: ['onerror','onload','onclick','onmouseover']`. This is a one-line config change that eliminates the most common XSS vectors.
- Remove `KaTeX trust: true`. The `trust` option allows arbitrary HTML in math expressions — it is not needed for standard LaTeX rendering. Set `trust: false`.
- For Mermaid: render diagrams in a sandboxed `<iframe srcdoc="...">` with `sandbox="allow-scripts"` and no `allow-same-origin`. The diagram renders in an isolated context; even if the AI injects malicious Mermaid syntax, it cannot access the parent document's DOM or cookies.
- Replace inline `onclick` citation handlers with `data-citation-id` attributes and a single delegated listener (see 2.6 solution). No executable code in AI-generated HTML.

---

## 4. Scaling math — when does it break?

Given current design, here's approximately when each dimension hits the wall:

| Dimension | Breaks at | Why |
|---|---|---|
| Concurrent users generating audio | ~25–50 | OpenAI `tts-1` tier rate limit with 4 parallel workers per user |
| Concurrent users generating chat | ~20 | OpenRouter `grok-4.1-fast` rate limit on a shared key |
| Active notebooks w/ RAG | ~500 | ivfflat index w/ lists=100 retrieval latency |
| Documents in a notebook | ~50 | Re‑index flow requires the browser tab to stay open for ~50 serial LLM calls |
| Handbook length | ~15 pages | Continuation loop + 20 KB source window = repetitive filler beyond this |
| Storage growth | ~1 active user | No lifecycle → unbounded bucket growth; visible in first week |
| LLM budget | Hours | Once the public Docker image's keys are scraped, someone will vacuum your OpenAI credits |
| Support volume | Day 1 | NVIDIA embeddings URL is hardcoded to `localhost:5173` → prod is silently broken for every new upload |

These are informed estimates, not measurements. They all improve by 1–2 orders of magnitude once generators move server‑side.

---

## 5. What the target architecture has to look like

The shortest path to a sustainable system — the smallest change set that unlocks everything above.

### 5.1 Move every generator behind a server

```
Browser                     Server (Edge Functions + queue worker)
 │                           │
 │ POST /jobs { type: ... } ─▶ insert into `jobs` (status=queued)
 │                           │  return job_id
 │  subscribe Realtime on    │
 │  jobs where id=job_id     ▼
 │                         queue worker (Deno / Node / Cloud Run)
 │                           ├── has the API keys
 │                           ├── runs the generator
 │                           ├── writes artifacts to Storage
 │                           ├── writes rows to generated_assets
 │                           └── updates jobs.status = completed
 │◀── Realtime event ────────┘
```

Every generator in `lib/*Generator.ts` today becomes a pure function on the server. The browser calls a single `createJob()` endpoint and subscribes for progress. Secrets never touch the browser.

**Recommended stack:** Cloud Run / Fly.io / Railway worker — a small Node service that consumes jobs from a Postgres queue. No function time limit, easier FFmpeg, easier to scale horizontally. Supabase Edge Functions are fine for short operations (chat, embeddings) but cannot run a 1‑hour audio pipeline.

**How to refactor each generator:**

1. Strip the generator function signature down to pure inputs/outputs — no `window`, no `localStorage`, no `VITE_*` env reads.
2. Move the stripped function into `worker/generators/<name>.ts`.
3. Create a thin Supabase Edge Function `supabase/functions/create-job/index.ts` that validates the request, inserts a `jobs` row, and returns `{ jobId }`.
4. The browser replaces its direct generator call with:
   ```ts
   const { jobId } = await supabase.functions.invoke('create-job', { body: { type: 'handbook', input: { notebookId, options } } });
   const channel = supabase.channel(`job:${jobId}`).on('postgres_changes', ...).subscribe();
   ```
5. The worker polls `SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`, runs the generator, and writes results back.

**What to delete from the browser bundle once each generator moves:**
- All `VITE_OPENROUTER_API_KEY`, `VITE_OPENAI_API_KEY`, `VITE_FAL_API_KEY` reads in the generator files.
- The `TTSWorkerPoolAgent` browser concurrency logic — the worker handles parallelism server‑side with a real semaphore.
- The `localStorage` checkpoint writes in `audioMasterAgent.ts` (lines ~180–220) — replace with DB phase writes.

### 5.2 Replace the audio mixer with FFmpeg

**What to change in `lib/agents/audioMixer.ts`:** Delete the entire `mixAudioSegments` function. It splices raw `Uint8Array` zeros into MP3 streams, which corrupts frame headers. Replace with a worker endpoint:

```ts
// worker/audio/mix.ts
import { execFile } from 'node:child_process';
import { writeFile, readFile, unlink } from 'node:fs/promises';

async function mixSegments(segments: { path: string; silenceAfterMs: number }[]): Promise<Buffer> {
  // Write ffmpeg concat manifest
  const manifest = segments.flatMap(s => [
    `file '${s.path}'`,
    s.silenceAfterMs > 0 ? `duration ${s.silenceAfterMs / 1000}` : null,
  ]).filter(Boolean).join('\n');
  await writeFile('/tmp/concat.txt', manifest);

  return new Promise((resolve, reject) => {
    execFile('ffmpeg', [
      '-f', 'concat', '-safe', '0', '-i', '/tmp/concat.txt',
      '-af', 'loudnorm',           // normalize loudness
      '-c:a', 'libmp3lame', '-q:a', '4',
      '-f', 'mp3', 'pipe:1',
    ], { encoding: 'buffer' }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout);
    });
  });
}
```

**What to change in `lib/agents/ttsWorkerPool.ts`:** Fix the ordering bug at the `actualIndex` assignment. Replace:
```ts
const actualIndex = results.findIndex(r => !r);
results[actualIndex] = processed;
```
with:
```ts
results[segment.originalIndex * 1000 + segment.splitIndex] = processed;
```
and initialise `results` as a `Map<number, ProcessedSegment>` rather than a sparse array to avoid the `100` vs `1000` multiplier collision.

**What to change in `lib/agents/audioMixer.ts` `calculateAudioDuration`:** Delete the fixed‑bitrate estimate entirely. On the server, run `ffprobe -v quiet -print_format json -show_format <file>` and read `format.duration`. On the client, use the `<audio>` element's `duration` property after loading the blob URL — it's exact.

As a bonus, the same worker can render actual MP4 video:
```bash
ffmpeg -loop 1 -i slide_N.png -i segment_N.mp3 -t <duration> \
       -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080" \
       -c:v libx264 -tune stillimage -c:a aac -shortest slide_N.mp4
# then concat all slide videos:
ffmpeg -f concat -safe 0 -i slides.txt -c copy output.mp4
```

### 5.3 Relational persistence for generated content

**What to change in `supabase/setup-database.sql`:** Add these tables and drop the JSONB blob pattern.

```sql
-- Handbooks
CREATE TABLE handbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  word_count int,
  page_count int,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE handbook_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handbook_id uuid REFERENCES handbooks(id) ON DELETE CASCADE,
  level int NOT NULL,          -- 1=H1, 2=H2, etc.
  title text NOT NULL,
  content_markdown text NOT NULL,
  order_index int NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content_markdown)) STORED
);
CREATE INDEX ON handbook_sections USING GIN(search_vector);
CREATE TABLE handbook_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handbook_id uuid REFERENCES handbooks(id) ON DELETE CASCADE,
  type text NOT NULL,          -- 'pdf' | 'cover_image'
  storage_path text NOT NULL
);

-- Reports (same shape)
CREATE TABLE reports ( ... );
CREATE TABLE report_sections ( ... );

-- Slide decks
CREATE TABLE slide_decks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  audio_storage_path text,
  video_storage_path text,     -- null until MP4 worker finishes
  created_at timestamptz DEFAULT now()
);
CREATE TABLE slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id uuid REFERENCES slide_decks(id) ON DELETE CASCADE,
  order_index int NOT NULL,
  title text,
  bullets jsonb,
  mermaid_code text,
  image_storage_path text,     -- never store base64 in DB
  narration text,
  duration_ms int
);
```

**What to change in `lib/handbookGenerator.ts` `saveHandbook()`:** Replace the single `generated_assets` upsert with:
```ts
const { data: hb } = await supabase.from('handbooks').insert({ notebook_id, title, word_count }).select().single();
const sections = parseMarkdownToSections(content); // split on ## headings
await supabase.from('handbook_sections').insert(sections.map((s, i) => ({ handbook_id: hb.id, ...s, order_index: i })));
```

**What to change in `components/HandbookPlayback.tsx`:** Replace the single `metadata.handbookData` read with a join query:
```ts
const { data } = await supabase
  .from('handbooks').select('*, handbook_sections(*)').eq('id', handbookId).single();
const markdown = data.handbook_sections
  .sort((a, b) => a.order_index - b.order_index)
  .map(s => `${'#'.repeat(s.level)} ${s.title}\n\n${s.content_markdown}`)
  .join('\n\n');
```

### 5.4 Model router

**Create `lib/models.ts` (server‑side only, never imported by browser code):**
```ts
export const models = {
  chat:  { primary: 'x-ai/grok-4.1-fast',                  fallback: 'openai/gpt-4o-mini',                costPer1kTokens: 0.005 },
  embed: { primary: 'nvidia/bge-m3',                        fallback: 'openai/text-embedding-3-small',     costPer1kTokens: 0.00002 },
  tts:   { primary: 'openai/tts-1',                         fallback: 'google/chirp-hd',                   costPerChar: 0.000015 },
  image: { primary: 'openai/gpt-image-1',                   fallback: 'fal/flux.1-schnell',                costPerImage: 0.04 },
  graph: { primary: 'openai/gpt-4o-mini',                   fallback: 'nvidia/nemotron-3-nano-30b-a3b:free', costPer1kTokens: 0.00015 },
} as const;

export async function callWithFallback(capability: keyof typeof models, fn: (model: string) => Promise<unknown>) {
  try {
    return await fn(models[capability].primary);
  } catch (e) {
    console.warn(`Primary model failed for ${capability}, falling back`, e);
    return fn(models[capability].fallback);
  }
}
```

**What to change across generators:** Search for every hardcoded model string (`grok-4.1-fast`, `nemotron`, `gpt-4o-mini`, `tts-1`, `gpt-image-1`, `bge-m3`) across `lib/` and replace with `models.<capability>.primary`. There are ~40 occurrences across 10+ files — do this as a single grep‑and‑replace pass.

### 5.5 Job queue, idempotency, resumability

**Add to migrations:**
```sql
CREATE TYPE job_status AS ENUM ('queued', 'running', 'completed', 'failed', 'dead');
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,          -- 'handbook' | 'audio' | 'video' | 'report' | ...
  input_jsonb jsonb NOT NULL,
  status job_status NOT NULL DEFAULT 'queued',
  phase text,                  -- current phase name for progress display
  progress_pct int DEFAULT 0,
  attempts int DEFAULT 0,
  last_error text,
  cost_usd numeric(10,6) DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON jobs(status, created_at) WHERE status = 'queued';
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own jobs" ON jobs FOR ALL USING (user_id = auth.uid());
```

**How generators become resumable:** Each generator phase (e.g. `research`, `outline`, `draft`, `continuation_1..N`, `cleanup`) writes its output to a `job_phases` table before advancing:
```sql
CREATE TABLE job_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  phase text NOT NULL,
  output_jsonb jsonb,          -- small structured data
  storage_path text,           -- large artifacts (audio segments, images)
  completed_at timestamptz DEFAULT now(),
  UNIQUE(job_id, phase)
);
```
On resume, the worker queries `SELECT phase FROM job_phases WHERE job_id = $1` and skips already‑completed phases. This replaces the `localStorage` checkpoint in `audioMasterAgent.ts` that currently saves `{}` for every `ArrayBuffer`.

### 5.6 Rate limiting + usage accounting

**Add to migrations:**
```sql
CREATE TABLE usage_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  job_id uuid REFERENCES jobs(id),
  provider text NOT NULL,
  model text NOT NULL,
  tokens_in int,
  tokens_out int,
  chars int,
  images int,
  cost_usd numeric(10,6) NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON usage_events(user_id, created_at);
```

**In the worker, wrap every LLM/TTS/image call:**
```ts
async function trackedCompletion(userId: string, jobId: string, params: CompletionParams) {
  const result = await openrouter.chat.completions.create(params);
  const cost = (result.usage.prompt_tokens + result.usage.completion_tokens) / 1000 * models.chat.costPer1kTokens;
  await supabase.from('usage_events').insert({ user_id: userId, job_id: jobId, provider: 'openrouter', model: params.model, tokens_in: result.usage.prompt_tokens, tokens_out: result.usage.completion_tokens, cost_usd: cost });
  await supabase.from('jobs').update({ cost_usd: supabase.raw('cost_usd + ?', [cost]) }).eq('id', jobId);
  return result;
}
```

**Rate limit check at job creation (Edge Function):**
```ts
const { count } = await supabase.from('jobs')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', userId)
  .eq('type', jobType)
  .gte('created_at', new Date(Date.now() - 86400000).toISOString());
if (count >= DAILY_LIMITS[jobType]) return new Response('quota exceeded', { status: 429 });
```

### 5.7 Storage lifecycle

**What to change in `supabase/setup-storage-assets.sql`:** Add bucket lifecycle policies and folder conventions:
```sql
-- Separate draft vs final paths so TTL policies can target them
-- assets/drafts/<user_id>/<job_id>/*  → auto-delete after 7 days
-- assets/final/<user_id>/<asset_id>/* → auto-delete after 90 days (free tier)
```

In the worker, write draft segments to `assets/drafts/<userId>/<jobId>/segment_N.mp3` and only move to `assets/final/` on job completion. Add a `pg_cron` job that runs nightly:
```sql
SELECT cron.schedule('cleanup-drafts', '0 3 * * *', $$
  DELETE FROM storage.objects
  WHERE bucket_id = 'assets'
    AND name LIKE 'drafts/%'
    AND created_at < now() - interval '7 days';
$$);
```

**What to change in `lib/agents/videoMasterAgent.ts`:** Remove the `imageBase64` field from the `Slide` type entirely. After `uploadSlideImage` runs, only `imageUrl` (the storage path) should remain on the object. The current code keeps both, doubling payload size and risking the 1 MB Supabase row limit on larger decks.

### 5.8 Move PDF generation to server

**What to delete:** `lib/pdfGenerator.ts` and `lib/pdfStyles.ts` entirely. Remove `jspdf` and `html2canvas` from `package.json` — this eliminates the 10+ CVEs and ~400 KB from the bundle.

**What to add in the worker:**
```ts
// worker/pdf/render.ts
import puppeteer from 'puppeteer';

export async function renderHandbookPdf(handbookId: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  // Load the internal render URL (worker has network access to the app)
  await page.goto(`${process.env.APP_URL}/render/handbook/${handbookId}?token=${serviceToken}`);
  await page.waitForSelector('[data-render-ready]');
  const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' } });
  await browser.close();
  return pdf;
}
```

Add a `GET /render/handbook/:id` route in the React app that renders the handbook without nav/chrome and sets `data-render-ready` when fonts and images are loaded. The PDF is then searchable, selectable, and accessible.

### 5.9 Migrations discipline

**What to create:** `supabase/migrations/` directory with numbered files:
```
supabase/migrations/
  0001_initial_schema.sql          ← contents of setup-database.sql (canonical)
  0002_lightrag_1024_dimensions.sql ← contents of migrate-to-1024-dimensions.sql
  0003_lightrag_functions.sql       ← contents of lightrag-functions.sql (updated for 1024-dim)
  0004_jobs_queue.sql               ← jobs, job_phases tables
  0005_relational_content.sql       ← handbooks, reports, slide_decks, slides tables
  0006_usage_events.sql             ← usage_events table
```

**What to delete:** `supabase/setup-database.sql`, `supabase/schema_safe.sql`, `supabase/migrate-to-1024-dimensions.sql` — these are replaced by the numbered migrations. The dimension mismatch (1024 vs 1536) is resolved in `0003` by ensuring `match_document_chunks` uses `vector(1024)` consistently.

**What to add to CI (`.github/workflows/`):**
```yaml
- name: Run migrations against ephemeral Supabase
  run: |
    supabase db reset --db-url ${{ secrets.SUPABASE_TEST_DB_URL }}
    supabase db push --db-url ${{ secrets.SUPABASE_TEST_DB_URL }}
    supabase db lint
```

### 5.10 Observability

**What to add to `main.tsx`:**
```ts
import * as Sentry from '@sentry/react';
Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN, release: import.meta.env.VITE_GIT_SHA, tracesSampleRate: 0.1 });
```

**What to add to the worker:**
```ts
import * as Sentry from '@sentry/node';
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.2 });
// Wrap each job execution in a Sentry transaction
const transaction = Sentry.startTransaction({ name: `job.${job.type}`, op: 'job' });
```

**What to add to the Edge Function for budget alerting:**
```ts
// After each usage_events insert, check rolling 30-day spend
const { data } = await supabase.rpc('monthly_spend_usd', { uid: userId });
if (data > MONTHLY_BUDGET_ALERT_USD) {
  await fetch(process.env.PAGERDUTY_WEBHOOK, { method: 'POST', body: JSON.stringify({ summary: `Spend alert: $${data} this month` }) });
}
```

**What to add to `supabase/`:**
```sql
CREATE OR REPLACE FUNCTION monthly_spend_usd(uid uuid) RETURNS numeric AS $$
  SELECT COALESCE(SUM(cost_usd), 0) FROM usage_events
  WHERE user_id = uid AND created_at > date_trunc('month', now());
$$ LANGUAGE sql STABLE;
```

---

## 6. Verdict and roadmap

**Current architecture is not sustainable for deployment beyond a private beta.** The features *work* in the sense that a developer with good Wi‑Fi and a fresh OpenAI key can click buttons and see output. At production load or with real users, the failures cascade:

1. API keys scraped from the public Docker image → account drain within days.
2. NVIDIA embeddings URL hardcoded to localhost → every new upload in prod silently fails ingestion.
3. Audio mixer producing malformed MP3 → iOS users can't play podcasts.
4. No server orchestration → any long generation dies when the tab backgrounds.
5. JSONB blob persistence → database costs scale faster than the user base.
6. No rate limiting → one bad actor kills the product for everyone.

### Two‑week path to "we can deploy"

The goal is a defensible closed‑beta deployment. Not every item in section 5 ships in two weeks — video MP4 export and full observability are deferred — but the P0 security holes are closed, generators move server‑side, and audio works correctly.

| Day | Focus | Concrete deliverables |
|---|---|---|
| **1** | Hotfix — security | Rotate all API keys (OpenAI, OpenRouter, FAL, NVIDIA). Privatise the Docker image on Docker Hub. Patch the `password_reset_codes` RPC to require auth. Remove all `VITE_*` AI key reads from the browser bundle (replace with `undefined` stubs that throw if called client‑side). |
| **2** | Hotfix — NVIDIA URL + schema | Fix `lib/nvidiaEmbeddings.ts`: replace `http://localhost:5173/nvidia-api/v1` with `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/embed`. Create `supabase/functions/embed/index.ts` that proxies to NVIDIA with the server‑side key. Create `supabase/migrations/` directory; consolidate the four SQL files into numbered migrations; resolve the 1024 vs 1536 dimension conflict in `0003_lightrag_functions.sql`. |
| **3–4** | Worker scaffold + job queue | Scaffold `worker/` Node service (Dockerfile, `package.json`, `src/index.ts` poll loop). Add `jobs` and `job_phases` tables (migration `0004`). Add `supabase/functions/create-job/index.ts` Edge Function. Wire the browser's `createJob()` + Realtime subscription pattern for one generator (handbook) as the proof‑of‑concept. |
| **5** | Move chat + embeddings server‑side | Move `lib/aiChat.ts` LLM calls into `supabase/functions/chat/index.ts`. Move `lib/nvidiaEmbeddings.ts` + `lib/documentProcessor.ts` embedding calls into the `embed` Edge Function. Browser now holds zero AI keys. Add basic Sentry to browser and worker. |
| **6–7** | Audio worker + FFmpeg | Move `lib/agents/audioMasterAgent.ts` pipeline into `worker/generators/audio.ts`. Replace `audioMixer.ts` with the FFmpeg concat approach (section 5.2). Fix the `TTSWorkerPoolAgent` ordering bug. Wire TTS calls through the worker (server‑side OpenAI key). Test a full podcast end‑to‑end; verify iOS Safari plays the output. |
| **8** | Handbook + report workers | Move `lib/handbookGenerator.ts` and `lib/reportGenerator.ts` into `worker/generators/`. Add `handbooks`, `handbook_sections`, `reports`, `report_sections` tables (migration `0005`). Update `saveHandbook()` and `saveReport()` to write relational rows instead of JSONB blobs. Update `HandbookPlayback.tsx` and `ReportPlayback.tsx` to read from the new tables. |
| **9** | Quiz, flashcard, mindmap workers | Move `lib/quizGenerator.ts`, `lib/flashcardGenerator.ts`, `lib/mindmapGenerator.ts` into the worker. These are short jobs (< 30 s) so they can run inside a single Edge Function invocation if preferred. Add `usage_events` table (migration `0006`) and wrap every LLM call in `trackedCompletion()`. |
| **10** | Rate limiting + quotas | Add per‑user daily quota check in `create-job` Edge Function. Add `monthly_spend_usd` SQL function. Add budget alert webhook call when spend crosses threshold. Display quota usage in the UI (`N / 10 podcasts this month`). |
| **11** | Model router + hardcoded string cleanup | Create `worker/lib/models.ts`. Grep‑and‑replace all ~40 hardcoded model strings across `worker/generators/`. Add `callWithFallback()` wrapper. Verify fallback triggers correctly when primary returns 429. |
| **12** | Storage lifecycle + slide base64 fix | Add `pg_cron` draft‑cleanup job. Fix `videoMasterAgent.ts` to drop `imageBase64` from `Slide` after upload. Add `assets/drafts/` vs `assets/final/` path convention to the worker. |
| **13** | Migrations CI + RLS tests | Add GitHub Actions step that runs `supabase db reset` + `supabase db push` + `supabase db lint` against an ephemeral project. Write pgTAP tests for the three most critical RLS policies (jobs, handbooks, usage_events). |
| **14** | Buffer + closed‑beta cut | Fix any issues found in days 1–13. Smoke‑test the full flow: upload PDF → generate handbook → generate podcast → download. Tag `v0.1.0-beta`. |

**What is explicitly deferred past two weeks:**
- Real MP4 video export (the in‑browser playback stays as‑is for now).
- Server‑side PDF export via Puppeteer (jsPDF stays, CVE accepted for beta).
- Full OpenTelemetry tracing.
- HNSW index migration (ivfflat is fine at beta scale).
- `/admin/jobs` dashboard.

Each phase is independently shippable and reduces attack surface as it lands. Closed‑beta users can be onboarded from day 8 onward once the key exposure and audio bugs are resolved.

---

## 7. Appendix — files referenced

| Concern | Paths |
|---------|-------|
| Generators | `lib/handbookGenerator.ts`, `lib/reportGenerator.ts`, `lib/quizGenerator.ts`, `lib/flashcardGenerator.ts`, `lib/mindmapGenerator.ts`, `lib/slideGenerator.ts`, `lib/visualSlideGenerator.ts`, `lib/audioGenerator.ts`, `lib/aiChat.ts`, `lib/smartPromptGenerator.ts`, `lib/documentGenerator/**` |
| Agents / orchestration | `lib/agents/audioMasterAgent.ts`, `lib/agents/videoMasterAgent.ts`, `lib/agents/ttsWorkerPool.ts`, `lib/agents/audioMixer.ts`, `lib/agents/segmentValidator.ts`, `lib/agents/jobStateManager.ts`, `lib/documentGenerator/agents/orchestrator.ts` |
| RAG | `lib/lightrag.ts`, `lib/lightragRetrieval.ts`, `lib/nvidiaEmbeddings.ts`, `lib/documentProcessor.ts`, `lib/reindexService.ts`, `supabase/lightrag-functions.sql` |
| Rendering / export | `lib/markdownRenderer.ts`, `lib/pdfGenerator.ts`, `lib/pdfStyles.ts`, `components/HandbookPlayback.tsx`, `components/ReportPlayback.tsx`, `components/VideoOverviewPlayback.tsx`, `components/MermaidDiagram.tsx` |
| Persistence | `supabase/setup-database.sql`, `supabase/schema_safe.sql`, `supabase/migrate-to-1024-dimensions.sql`, `supabase/setup-storage-assets.sql` |
| Deployment | `Dockerfile`, `nginx.conf`, `vite.config.ts`, `.github/workflows/docker.yml`, `DEPLOYMENT.md` |
