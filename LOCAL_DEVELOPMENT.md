# Local Development Guide

Complete guide to running Memento on your local machine.

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Git | any | `git --version` |

---

## 1. Clone and Install

```bash
git clone https://github.com/LUNARTECH-X/memento.git
cd memento
npm install
```

---

## 2. Environment Variables

Copy the example file:

```bash
cp .env.example .env.local
```

Fill in each value:

### Supabase (Required)
1. Go to [supabase.com](https://supabase.com) → your project
2. **Settings → API**
3. Copy **Project URL** → `VITE_SUPABASE_URL`
4. Copy **anon public** key → `VITE_SUPABASE_ANON_KEY`

### OpenAI (Required — TTS + image gen + entity extraction)
1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Create a new key → `VITE_OPENAI_API_KEY`

### NVIDIA NIM (Required — nv-embedqa-e5-v5 embeddings)
1. Go to [build.nvidia.com](https://build.nvidia.com)
2. Sign in → **API Keys** → Generate key → `VITE_NVIDIA_API_KEY`
3. The key starts with `nvapi-`

> **Important:** NVIDIA embeddings only work via the Vite dev proxy (`npm run dev`). The proxy rewrites `/nvidia-api/*` → `https://integrate.api.nvidia.com/*` to bypass CORS. This does not work in production builds without a server-side proxy.

### Lingshi (Required - chat + script generation)
Set these as Supabase Edge Function secrets:

```bash
LINGSHI_BASE_URL=https://api.lingshi.chat
LINGSHI_API_KEY=sk-your-lingshi-key
CHAT_MODELS=gpt-5.4-mini,gpt-5.4-low,gpt-5.4
```

### Web3Forms (Required — password reset emails)
1. Go to [web3forms.com](https://web3forms.com)
2. Enter your email → get access key → `VITE_WEB3FORMS_KEY`

### fal.ai (Optional — FLUX image generation for video slides)
1. Go to [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys)
2. Create a key → `VITE_FAL_API_KEY`

---

## 3. Supabase Database Setup

In your Supabase project → **SQL Editor**, run these files **in this exact order**:

### Step 1 — Core schema
```
supabase/setup-database.sql
```
Creates all tables (`profiles`, `notebooks`, `sources`, `document_chunks`, `graph_nodes`, `graph_edges`, `generated_assets`, etc.), RLS policies, and pgvector extension.

### Step 2 — LightRAG functions
```
supabase/lightrag-functions.sql
```
Creates vector search functions for the knowledge graph. Uses `vector(1024)` dimensions (nv-embedqa-e5-v5).

### Step 3 — Document chunk search
```
supabase/match_document_chunks.sql
```
Creates the `match_document_chunks` RPC function used by RAG chat.

### Step 4 — Storage policies
```
supabase/setup-storage-assets.sql
```
Sets up RLS policies for the storage buckets.

> **Do not run** `schema_safe.sql`, `reset_password_function.sql`, or `password_reset_codes_table.sql` — these are outdated or contain security issues.

### Storage Buckets

In Supabase Dashboard → **Storage**, create three buckets:

| Bucket | Access |
|--------|--------|
| `documents` | Private |
| `assets` | Public |
| `avatars` | Public |

---

## 4. Run the Dev Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

The dev server starts with:
- Hot module replacement
- NVIDIA API proxy at `/nvidia-api` → `https://integrate.api.nvidia.com`

---

## 5. Verify Everything Works

| Feature | How to test |
|---------|-------------|
| Auth | Sign up with email → check Supabase Auth dashboard |
| PDF upload | Create notebook → upload a PDF → wait for "completed" status |
| RAG chat | Ask a question about an uploaded document |
| Audio generation | Studio → Audio Overview → 10 min → Generate |
| Embeddings | Upload a PDF — if it gets stuck on "processing", check NVIDIA key |

---

## Common Issues

### PDF upload stuck on "processing"
- NVIDIA API key is missing or invalid
- You're not running `npm run dev` (the proxy only works in dev mode)
- Check browser console for `nvidia-api` 401/403 errors

### Chat returns no results
- Documents haven't finished processing (wait for "completed" status)
- `match_document_chunks.sql` wasn't run in Supabase

### Audio generation fails
- OpenAI key is missing or has no TTS credits
- Check browser console for OpenAI API errors

### "relation does not exist" Supabase error
- SQL files were run out of order — re-run `setup-database.sql` first

### Google OAuth not working
- Add `http://localhost:5173` to your Supabase Auth → URL Configuration → Redirect URLs

---

## Available Scripts

```bash
npm run dev      # Start dev server at localhost:5173
npm run build    # Build for production (outputs to dist/)
npm run preview  # Preview the production build locally
```

---

## Project Structure

```
memento/
├── components/          # React UI components
├── lib/                 # AI/service logic
│   ├── aiChat.ts        # RAG chat
│   ├── audioGenerator.ts
│   ├── lightrag.ts      # Knowledge graph extraction
│   ├── documentProcessor.ts
│   └── ...
├── pages/               # Route-level pages
├── supabase/            # SQL migration files
├── documentation/       # Architecture and planning docs
├── .env.example         # Environment variable template
├── vite.config.ts       # Dev server + proxy config
└── LOCAL_DEVELOPMENT.md # This file
```
