# 🧠 Memento — Feature Documentation

> Detailed technical documentation of each feature and how it was implemented

---

# Table of Contents

1. [LightRAG Knowledge Graph System](#1-lightrag-knowledge-graph-system)
2. [Audio Overview Generation](#2-audio-overview-generation)
3. [Master Agent Architecture](#3-master-agent-architecture)
4. [Document Processing Pipeline](#4-document-processing-pipeline)
5. [RAG Chat System](#5-rag-chat-system)
6. [Flashcard Generation](#6-flashcard-generation)
7. [Quiz Generation](#7-quiz-generation)
8. [Mind Map Generation](#8-mind-map-generation)
9. [Video Overview Generation](#9-video-overview-generation)

---

# 1. LightRAG Knowledge Graph System

## Overview

LightRAG is a **graph-based retrieval system** that extracts entities and relationships from documents to create an interconnected knowledge graph. Unlike traditional vector RAG which only finds similar text chunks, LightRAG understands the **structure and relationships** between concepts.

## Why LightRAG?

| Traditional RAG | LightRAG |
|-----------------|----------|
| Finds similar text chunks | Understands concept relationships |
| Linear text matching | Graph-based knowledge structure |
| Miss connections between concepts | Discovers hidden connections |
| Context limited to chunks | Context includes relationships |

## Technical Implementation

### Files Involved
- `lib/lightrag.ts` — Entity and relationship extraction
- `lib/lightragRetrieval.ts` — Graph-based search and retrieval
- `supabase/lightrag-functions.sql` — PostgreSQL vector search functions

### Entity Extraction Process

```
┌─────────────────────────────────────────────────────────────────┐
│                    LIGHTRAG EXTRACTION PIPELINE                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📄 Document Chunks                                            │
│        │                                                        │
│        ▼                                                        │
│  ┌─────────────────┐                                           │
│  │   GPT-4 Turbo   │  ◄── Entity Type Classification          │
│  │   Extraction    │      (Concept, Theory, Formula,           │
│  │                 │       Person, Law, Process, etc.)         │
│  └────────┬────────┘                                           │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐     ┌─────────────────┐                   │
│  │    ENTITIES     │     │  RELATIONSHIPS  │                   │
│  │  • Name         │     │ • Source → Target                   │
│  │  • Type         │     │ • Relation Type                     │
│  │  • Description  │     │ • Description                       │
│  └────────┬────────┘     └────────┬────────┘                   │
│           │                       │                             │
│           ▼                       ▼                             │
│  ┌─────────────────────────────────────────┐                   │
│  │        OpenAI Embeddings (1536-dim)     │                   │
│  │        text-embedding-3-small           │                   │
│  └────────────────────┬────────────────────┘                   │
│                       │                                         │
│                       ▼                                         │
│  ┌─────────────────────────────────────────┐                   │
│  │     PostgreSQL with pgvector            │                   │
│  │     • graph_nodes table                 │                   │
│  │     • graph_edges table                 │                   │
│  └─────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### Entity Types (Educational Focus)

| Type | Description | Example |
|------|-------------|---------|
| **Concept** | Core ideas, abstract topics | "Machine Learning", "Photosynthesis" |
| **Theory** | Scientific/academic theories | "Theory of Relativity" |
| **Formula** | Mathematical formulas | "E=mc²", "Pythagorean Theorem" |
| **Person** | Key figures, researchers | "Einstein", "Darwin" |
| **Law** | Scientific laws | "Newton's Laws of Motion" |
| **Process** | Step-by-step processes | "Water Cycle", "Cell Division" |
| **Definition** | Important term definitions | "GDP", "Mitosis" |
| **Method** | Techniques, algorithms | "Scientific Method" |

### Relationship Types

| Type | Description | Example |
|------|-------------|---------|
| `is_a` | Category relationships | "Dog is_a Mammal" |
| `part_of` | Component relationships | "Mitochondria part_of Cell" |
| `causes` | Causal relationships | "Friction causes Heat" |
| `enables` | Enablement | "Photosynthesis enables Growth" |
| `discovered_by` | Attribution | "DNA discovered_by Watson" |
| `depends_on` | Dependencies | "ML depends_on Data" |
| `extends` | Extensions | "Relativity extends Mechanics" |

### Extraction Function

```typescript
// From lib/lightrag.ts
async function extractEntitiesAndRelationships(
  chunks: string[],
  sourceId: string,
  batchSize: number = 5
): Promise<ExtractedGraph>

// Process flow:
// 1. Process chunks in batches (avoid token limits)
// 2. GPT-4 extracts entities with JSON response format
// 3. GPT-4 identifies relationships between entities
// 4. Deduplicate entities by name (case-insensitive)
// 5. Deduplicate relationships
// 6. Return unified graph structure
```

### Hybrid Retrieval (LightRAG Query)

```typescript
// From lib/lightragRetrieval.ts
async function retrieveWithLightRAG(
  query: string,
  notebookId: string,
  options: RetrievalOptions
): Promise<LightRAGResult>

// Default weights:
// - chunkWeight: 0.4 (traditional vector search)
// - entityWeight: 0.35 (entity semantic search)
// - relationshipWeight: 0.25 (relationship search)
```

### Database Tables

**graph_nodes**
```sql
CREATE TABLE graph_nodes (
  id UUID PRIMARY KEY,
  notebook_id UUID REFERENCES notebooks(id),
  name TEXT,
  type TEXT,  -- Concept, Theory, Formula, etc.
  description TEXT,
  embedding VECTOR(1536),
  metadata JSONB,
  created_at TIMESTAMPTZ
);
```

**graph_edges**
```sql
CREATE TABLE graph_edges (
  id UUID PRIMARY KEY,
  notebook_id UUID REFERENCES notebooks(id),
  source_node_id UUID REFERENCES graph_nodes(id),
  target_node_id UUID REFERENCES graph_nodes(id),
  relation_type TEXT,  -- is_a, causes, enables, etc.
  description TEXT,
  embedding VECTOR(1536),
  created_at TIMESTAMPTZ
);
```

---

# 2. Audio Overview Generation

## Overview

Generates **NotebookLM-style podcast summaries** from document content. Supports single-speaker educational content and multi-speaker conversations (debates, deep dives, critical analysis).

## Technical Implementation

### Files Involved
- `lib/audioGenerator.ts` — Main generation logic
- `components/AudioOverviewModal.tsx` — UI component
- `lib/agents/ttsWorkerPool.ts` — Parallel TTS processing

### Audio Formats

| Format | Description | Speakers |
|--------|-------------|----------|
| **Solo** | Educational monologue | 1 speaker (Alloy voice) |
| **Deep Dive** | In-depth exploration | 2 speakers (Onyx + Nova) |
| **Critical** | Critical analysis | 2 speakers |
| **Debate** | Contrasting viewpoints | 2 speakers |
| **Analysis** | Systematic breakdown | 2 speakers |

### Duration Options

| Duration | Target Words | TTS Segments |
|----------|--------------|--------------|
| 10 min | ~1,500 words | 1 API call |
| 30 min | ~6,500 words | 2-3 continuations |
| 1 hour | ~13,000 words | 4-5 continuations |
| 3 hours | ~40,000 words | 12-15 continuations |

### Generation Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                 AUDIO GENERATION PIPELINE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PHASE 1: Content Retrieval                                    │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Fetch notebook sources                        │           │
│  │ • Retrieve LightRAG entities & relationships    │           │
│  │ • Build context for script generation           │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  PHASE 2: Script Generation (GPT-4 Turbo)                      │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Generate podcast script with speakers         │           │
│  │ • Include knowledge graph entities              │           │
│  │ • Recursive continuation for long content       │           │
│  │ • Remove premature conclusions                  │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  PHASE 3: Text-to-Speech (OpenAI TTS)                          │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Voice mapping:                                │           │
│  │   - Host1: Onyx (male, enthusiastic)            │           │
│  │   - Host2: Nova (female, analytical)            │           │
│  │   - Solo: Alloy (neutral, educational)          │           │
│  │ • Process segments sequentially                 │           │
│  │ • Rate limit management (100ms delay)           │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  PHASE 4: Audio Assembly                                       │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Concatenate audio buffers                     │           │
│  │ • Create final MP3 file                         │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  PHASE 5: Upload & Save                                        │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Upload to Supabase Storage (assets bucket)    │           │
│  │ • Save metadata to generated_assets table       │           │
│  │ • Store full transcript                         │           │
│  └─────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### Script Generation with Continuations

For longer podcasts (30min+), the system uses **recursive continuation**:

```typescript
// Continuation logic from audioGenerator.ts
while (currentWords < targetWords * 0.95 && continuationCount < maxContinuations) {
  // 1. Extract last 8 segments for context
  // 2. Identify topics already covered
  // 3. Generate continuation that flows naturally
  // 4. Remove premature conclusion phrases
  // 5. Append to existing segments
}
```

### Premature Conclusion Removal

The system actively removes conclusion phrases to ensure natural flow:

```typescript
const conclusionPatterns = [
  /thank you (for|so much for) (listening|joining)/gi,
  /that('s| is| was) (all|it) for (today|this episode)/gi,
  /in conclusion/gi,
  /to (summarize|wrap up|conclude)/gi,
  // ...more patterns
];
```

### Voice Configuration

```typescript
const VOICE_MAP = {
  host1: 'onyx',   // Male voice - enthusiastic
  host2: 'nova',   // Female voice - analytical
  solo: 'alloy',   // Neutral voice - educational
};

const speedMap = {
  host1: 1.05,  // Slightly faster for energy
  host2: 0.95,  // Slightly slower for clarity
  solo: 1.0,    // Normal pace
};
```

---

# 3. Master Agent Architecture

## Overview

The **Master Agent** pattern orchestrates complex multi-step AI generation pipelines with checkpointing, progress tracking, and parallel processing capabilities.

## Technical Implementation

### Files Involved
- `lib/agents/audioMasterAgent.ts` — Audio generation orchestrator
- `lib/agents/videoMasterAgent.ts` — Video generation orchestrator
- `lib/agents/ttsWorkerPool.ts` — Parallel TTS processing
- `lib/agents/segmentValidator.ts` — Segment validation
- `lib/agents/audioMixer.ts` — Audio mixing
- `lib/agents/jobStateManager.ts` — Checkpoint management

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    MASTER AGENT ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                   MASTER AGENT                            │ │
│  │  • Job ID generation (UUID)                               │ │
│  │  • Phase orchestration                                    │ │
│  │  • Progress reporting                                     │ │
│  │  • Checkpoint management                                  │ │
│  │  • Error handling & recovery                              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                    │
│          ┌─────────────────┼─────────────────┐                 │
│          │                 │                 │                 │
│          ▼                 ▼                 ▼                 │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐        │
│  │   VALIDATOR   │ │  TTS WORKER   │ │    MIXER      │        │
│  │    AGENT      │ │  POOL AGENT   │ │    AGENT      │        │
│  │               │ │               │ │               │        │
│  │ • Split long  │ │ • Parallel    │ │ • Concatenate │        │
│  │   segments    │ │   processing  │ │   audio       │        │
│  │ • Character   │ │ • Concurrency │ │ • Add silence │        │
│  │   validation  │ │   control     │ │   gaps        │        │
│  │ • Length      │ │ • Progress    │ │ • Format      │        │
│  │   checks      │ │   callbacks   │ │   output      │        │
│  └───────────────┘ └───────────────┘ └───────────────┘        │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                  JOB STATE MANAGER                        │ │
│  │  • Save/load checkpoints                                  │ │
│  │  • Resume failed jobs                                     │ │
│  │  • Progress persistence                                   │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Phase Progression (Audio)

```typescript
interface MasterAgentProgress {
  phase: 'script' | 'validation' | 'tts' | 'assembly' | 'upload' | 'completed';
  script: number;      // 0-100
  tts: number;         // 0-100
  upload: number;      // 0-100
  currentSegment: number;
  totalSegments: number;
  message: string;
}
```

### TTS Worker Pool (Parallel Processing)

```typescript
class TTSWorkerPoolAgent {
  constructor(options: {
    concurrency: number;  // Default: 4 parallel workers
    onProgress: (current: number, total: number) => void;
  });

  async processSegments(segments: SpeechSegment[]): Promise<ProcessedSegment[]>;
}
```

### Checkpoint System

```typescript
// Save checkpoint at each phase
stateManager.saveCheckpoint({
  notebookId,
  options,
  phase: 'tts',
  validatedSegments,
  progress: { script: 100, tts: 0, upload: 0 },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// Resume from checkpoint on failure
const checkpoint = stateManager.loadCheckpoint();
if (checkpoint && checkpoint.phase !== 'completed') {
  return await this.resumeGeneration(checkpoint);
}
```

---

# 4. Document Processing Pipeline

## Overview

Transforms uploaded files (PDFs, text) into searchable, AI-queryable content with vector embeddings and knowledge graph extraction.

## Technical Implementation

### Files Involved
- `lib/documentProcessor.ts` — Main processing logic
- `lib/pdfProcessor.ts` — PDF-specific extraction
- `pages/NewNotebookSetup.tsx` — Upload UI

### Processing Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│               DOCUMENT PROCESSING PIPELINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📁 FILE UPLOAD                                                │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Validate file type (PDF, TXT, etc.)           │           │
│  │ • Upload to Supabase Storage (documents bucket) │           │
│  │ • Create source record in sources table         │           │
│  │ • Status: "pending"                             │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  📝 TEXT EXTRACTION                                            │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • PDF.js extracts text from each page           │           │
│  │ • Preserve page structure                       │           │
│  │ • Status: "processing"                          │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  ✂️ TEXT CHUNKING                                              │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Chunk Size: 1000 characters                   │           │
│  │ • Overlap: 200 characters                       │           │
│  │ • Preserve semantic boundaries                  │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│          ┌──────────────┴──────────────┐                       │
│          ▼                              ▼                       │
│  ┌───────────────────┐      ┌───────────────────┐              │
│  │   VECTOR          │      │   LIGHTRAG        │              │
│  │   EMBEDDINGS      │      │   EXTRACTION      │              │
│  │                   │      │                   │              │
│  │ OpenAI            │      │ GPT-4 extracts:   │              │
│  │ text-embedding-   │      │ • Entities        │              │
│  │ 3-small           │      │ • Relationships   │              │
│  │ (1536 dimensions) │      │                   │              │
│  └─────────┬─────────┘      └─────────┬─────────┘              │
│            │                          │                         │
│            ▼                          ▼                         │
│  ┌───────────────────┐      ┌───────────────────┐              │
│  │ document_chunks   │      │ graph_nodes       │              │
│  │ table             │      │ graph_edges       │              │
│  └───────────────────┘      └───────────────────┘              │
│                                                                 │
│  Status: "completed" ✅                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Chunking Strategy

```typescript
// Split text into overlapping chunks
function chunkText(text: string): string[] {
  const CHUNK_SIZE = 1000;
  const OVERLAP = 200;
  
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    start += CHUNK_SIZE - OVERLAP;
  }
  
  return chunks;
}
```

---

# 5. RAG Chat System

## Overview

**Retrieval-Augmented Generation (RAG)** enables the AI to answer questions using context from uploaded documents, providing accurate and cited responses.

## Technical Implementation

### Files Involved
- `lib/aiChat.ts` — RAG logic
- `components/ChatInterface.tsx` — Chat UI
- `supabase/match_document_chunks.sql` — Vector search function

### RAG Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                       RAG CHAT SYSTEM                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ❓ USER QUESTION                                              │
│  "What is the main cause of climate change?"                   │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────┐           │
│  │  STEP 1: Generate Query Embedding              │           │
│  │  OpenAI text-embedding-3-small → 1536-dim      │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────┐           │
│  │  STEP 2: Vector Similarity Search              │           │
│  │  PostgreSQL pgvector cosine similarity         │           │
│  │  Find top-5 most similar chunks                │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────┐           │
│  │  STEP 3: LightRAG Enhancement                  │           │
│  │  Also retrieve:                                │           │
│  │  • Relevant entities from knowledge graph      │           │
│  │  • Related relationships                       │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────┐           │
│  │  STEP 4: Build Augmented Prompt                │           │
│  │  ┌─────────────────────────────────────┐       │           │
│  │  │ System: "You are a helpful assistant│       │           │
│  │  │ Answer based ONLY on the context..."│       │           │
│  │  │                                     │       │           │
│  │  │ Context:                            │       │           │
│  │  │ [Chunk 1] [Chunk 2] [Chunk 3]...   │       │           │
│  │  │                                     │       │           │
│  │  │ Entities: [Entity 1] [Entity 2]... │       │           │
│  │  │                                     │       │           │
│  │  │ User: "What is the main cause..."  │       │           │
│  │  └─────────────────────────────────────┘       │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  ┌─────────────────────────────────────────────────┐           │
│  │  STEP 5: GPT-4 Response Generation             │           │
│  │  Generate answer with inline citations [1][2]  │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  📤 RESPONSE WITH CITATIONS                                    │
│  "According to the sources [1][2], the main cause..."          │
└─────────────────────────────────────────────────────────────────┘
```

### Vector Search Function

```sql
-- supabase/match_document_chunks.sql
CREATE FUNCTION match_document_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  notebook_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM document_chunks dc
  JOIN sources s ON dc.source_id = s.id
  WHERE s.notebook_id = match_document_chunks.notebook_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

---

# 6. Flashcard Generation

## Overview

AI-generated flashcards for spaced repetition learning, leveraging LightRAG to create comprehensive study materials from document content.

## Technical Implementation

### Files Involved
- `lib/flashcardGenerator.ts` — Generation logic
- `components/FlashcardsModal.tsx` — Generation UI
- `components/FlashcardsPlayback.tsx` — Study interface

### Generation Options

| Option | Values |
|--------|--------|
| **Count** | 10, 25, or 50 cards |
| **Difficulty** | Easy, Medium, Hard |
| **Custom Focus** | Optional topic focus |

### Generation Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│               FLASHCARD GENERATION PIPELINE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📚 SOURCE RETRIEVAL                                           │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Fetch notebook sources                        │           │
│  │ • LightRAG entity/relationship retrieval        │           │
│  │ • Focused or broad based on custom prompt       │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  🧠 GPT-4 CARD GENERATION                                      │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Difficulty-specific instructions              │           │
│  │ • JSON response format                          │           │
│  │ • Front/Back/Hint structure                     │           │
│  │ • Educational focus on testable concepts        │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  💾 SAVE & TRACK                                               │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Save to generated_assets table                │           │
│  │ • LocalStorage progress tracking                │           │
│  │ • Learning/Reviewing/Mastered states            │           │
│  └─────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### Difficulty Levels

| Level | Description |
|-------|-------------|
| **Easy** | Basic facts, definitions, key terms. Short, memorable answers. |
| **Medium** | Concepts requiring understanding of relationships. Application questions. |
| **Hard** | Deep understanding, synthesis, edge cases. Multi-step reasoning. |

### Card Structure

```typescript
interface Flashcard {
  id: string;
  front: string;        // Question or prompt
  back: string;         // Answer
  hint?: string;        // Optional hint
  difficulty: string;   // Easy, Medium, Hard
  relatedEntities?: string[];  // LightRAG entities
}
```

---

# 7. Quiz Generation

## Overview

AI-generated quizzes with multiple question types for comprehensive knowledge assessment.

## Technical Implementation

### Files Involved
- `lib/quizGenerator.ts` — Generation logic
- `components/QuizModal.tsx` — Generation UI
- `components/QuizPlayback.tsx` — Quiz taking interface

### Question Types

| Type | Format |
|------|--------|
| **Multiple Choice** | 4 options (A, B, C, D), one correct |
| **True/False** | Binary choice questions |
| **Short Answer** | Free-text response |
| **Mixed** | Combination of all types |

### Quiz Lengths

- 5 Questions (Quick assessment)
- 10 Questions (Standard assessment)
- 25 Questions (Comprehensive assessment)

### Generation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                 QUIZ GENERATION PIPELINE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 CONTEXT RETRIEVAL                                          │
│  • LightRAG entities and relationships                          │
│  • RAG chunks for detailed content                              │
│  • Focused retrieval if custom prompt provided                  │
│                         │                                       │
│                         ▼                                       │
│  🎯 GPT-4 QUESTION GENERATION                                  │
│  • Type-specific formatting (MC, T/F, Short Answer)             │
│  • Difficulty-appropriate complexity                            │
│  • Plausible distractors for wrong answers                      │
│  • Detailed explanations for each answer                        │
│                         │                                       │
│                         ▼                                       │
│  ✅ VALIDATION & SCORING                                       │
│  • Auto-grading for MC and T/F                                  │
│  • Answer comparison for short answer                           │
│  • Progress saving to localStorage                              │
│  • Results with explanations                                    │
└─────────────────────────────────────────────────────────────────┘
```

### Question Structure

```typescript
interface QuizQuestion {
  id: string;
  type: 'multiple-choice' | 'true-false' | 'short-answer';
  question: string;
  answers: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
  }>;
  correctAnswer: string;
  explanation: string;
  difficulty: string;
}
```

---

# 8. Mind Map Generation

## Overview

Visual knowledge graph generation that transforms document content into interactive, explorable mind maps.

## Technical Implementation

### Files Involved
- `lib/mindmapGenerator.ts` — Generation logic
- `components/MindMapModal.tsx` — Generation UI
- `components/MindMapPlayback.tsx` — Interactive visualization

### Layout Styles

| Style | Description |
|-------|-------------|
| **Hierarchical** | Tree structure, top-down flow |
| **Radial** | Central topic with radiating branches |
| **Flowchart** | Process/sequence flow with direction |
| **Concept Map** | Interconnected network with cross-links |

### Generation Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                MIND MAP GENERATION PIPELINE                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📊 KNOWLEDGE GRAPH RETRIEVAL                                  │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • getAllGraphData(notebookId, 50)               │           │
│  │ • Up to 50 entities and relationships           │           │
│  │ • Primary structure for visualization           │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  🧠 GPT-4 STRUCTURE GENERATION                                 │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Generate node hierarchy                       │           │
│  │ • Create meaningful edge labels                 │           │
│  │ • Node types: central, main, sub, detail       │           │
│  │ • Limit to 15-25 nodes for readability         │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  📐 POSITION CALCULATION                                       │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Style-specific layout algorithms              │           │
│  │ • Hierarchical: Tree positioning               │           │
│  │ • Radial: Concentric ring placement            │           │
│  │ • Flowchart: Column-based flow                 │           │
│  │ • Concept Map: Force-directed inspired         │           │
│  └─────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### Node Types

| Type | Description |
|------|-------------|
| **Central** | Main topic (only 1) |
| **Main** | Primary branches from central |
| **Sub** | Secondary concepts |
| **Detail** | Specific details/examples |

---

# 9. Video Overview Generation

## Overview

Generates slide-based video presentations with AI-generated visuals and narration.

## Technical Implementation

### Files Involved
- `lib/agents/videoMasterAgent.ts` — Orchestration
- `lib/slideGenerator.ts` — Slide creation
- `components/VideoOverviewModal.tsx` — Generation UI
- `components/VideoOverviewPlayback.tsx` — Video player

### Generation Phases

```
┌─────────────────────────────────────────────────────────────────┐
│              VIDEO GENERATION MASTER AGENT                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PHASE 1: SLIDE SCRIPT GENERATION                              │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Generate slide structure from sources         │           │
│  │ • Create narration text per slide               │           │
│  │ • Define visual descriptions                    │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  PHASE 2: IMAGE GENERATION                                     │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • OpenAI DALL-E or placeholder images           │           │
│  │ • Style-consistent visuals                      │           │
│  │ • Upload to Supabase Storage                    │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  PHASE 3: AUDIO NARRATION                                      │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Reuse audio pipeline from Master Agent        │           │
│  │ • Segment validation → TTS → Mixing             │           │
│  │ • Nova voice for professional narration         │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  PHASE 4: SLIDE-AUDIO SYNCHRONIZATION                          │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Calculate timing based on word count          │           │
│  │ • Map slide transitions to audio timestamps     │           │
│  └─────────────────────────────────────────────────┘           │
│                         │                                       │
│                         ▼                                       │
│  PHASE 5: UPLOAD & SAVE                                        │
│  ┌─────────────────────────────────────────────────┐           │
│  │ • Upload audio to storage                       │           │
│  │ • Save slide images                             │           │
│  │ • Store metadata in generated_assets            │           │
│  └─────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

### Video Overview Structure

```typescript
interface GeneratedVideoOverview {
  id: string;
  notebookId: string;
  title: string;
  slides: Slide[];           // Slide content + images
  audioUrl: string;          // Narration audio
  audioDuration: number;     // Total duration in ms
  slideTimings: {            // Sync info
    slideId: string;
    startMs: number;
    endMs: number;
  }[];
  metadata: {
    format: string;
    duration: string;
    style: string;
    slideCount: number;
    wordCount: number;
    createdAt: string;
  };
}
```

---

# Summary

| Feature | Key Technology | LightRAG Integration |
|---------|----------------|---------------------|
| **Audio Overview** | OpenAI TTS + GPT-4 | ✅ Entities inform script |
| **Flashcards** | GPT-4 JSON generation | ✅ Graph-based card creation |
| **Quiz** | GPT-4 + validation | ✅ Relationship-based questions |
| **Mind Map** | GPT-4 + layout algorithms | ✅ Primary data source |
| **Video Overview** | TTS + Image gen | ✅ Content structuring |
| **RAG Chat** | Vector search + GPT-4 | ✅ Hybrid retrieval |

---

> **Made with 💜 by LunarTech AI**
