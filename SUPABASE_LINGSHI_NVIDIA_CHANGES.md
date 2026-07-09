# Supabase, Lingshi, and NVIDIA Changes

## Summary

This document records the production fixes for notebook creation, document storage, chat provider config, and embeddings.

## Supabase Schema

- Restored `public.notebooks`, `public.sources`, `public.document_chunks`, and `public.generated_assets` in production.
- Added `public.profiles`, `public.graph_nodes`, and `public.graph_edges` to stop REST `404` errors during auth/profile lookup and document graph processing.
- Added RLS policies so users can access only their own notebook data.
- Kept document embeddings at `vector(1024)`:
  - `public.document_chunks.embedding vector(1024)`
  - `public.match_document_chunks(query_embedding vector(1024), ...)`
- Restored LightRAG match RPC functions in production:
  - `public.match_document_chunks`
  - `public.match_graph_nodes`
  - `public.match_graph_edges`
- Added local migration parity for document storage in `supabase/migrations/0007_documents_storage.sql`.
- Added local migration parity for profiles and graph tables in `supabase/migrations/0009_profiles_and_graph_tables.sql`.

## Supabase Storage

- Created private `documents` bucket in production.
- Added storage policies for authenticated users to upload, read, update, and delete objects under notebook-owned paths.
- Upload path ownership is checked against `public.notebooks`.

## Lingshi Chat Provider

- Replaced runtime OpenRouter usage with OpenAI-compatible Lingshi config.
- Supported secrets:
  - `LINGSHI_API_KEY`
  - `LINGSHI_BASE_URL`
  - `LINGSHI_DOCUMENT_MODEL`
  - `LINGSHI_AUDIO_MODEL`
  - `CHAT_MODELS`
- Current expected base URL:
  - `https://api.lingshi.chat`
- Current chat model list:
  - `gpt-5.4`
  - `gpt-5.4-low`
  - `gpt-5.4-medium`
  - `gpt-5.4-high`
  - `gpt-5.4-xhigh`
  - `gpt-5.4-mini`

## NVIDIA Embeddings

- Previous model:
  - `baai/bge-m3`
- Issue:
  - NVIDIA key authenticated, but `baai/bge-m3` embedding calls returned `500 InternalServerError`.
- New model:
  - `nvidia/nv-embedqa-e5-v5`
- Reason:
  - Tested successfully with the current NVIDIA key.
  - Returns `1024` dimensions.
  - Matches existing Postgres vector schema: `vector(1024)`.
- Updated files:
  - `lib/nvidiaEmbeddings.ts`
  - `supabase/functions/embed/index.ts`
  - `supabase/functions/chat/index.ts`

## Deployment Notes

- `chat` and `embed` edge functions must be redeployed after this change.
- Set optional override if needed:
  - `NVIDIA_EMBEDDING_MODEL=nvidia/nv-embedqa-e5-v5`
- Existing document chunks are empty in production at the time of this change, so no re-embedding migration is required.
