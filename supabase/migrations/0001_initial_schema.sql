CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.notebooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  title text NOT NULL,
  type text NOT NULL,
  file_path text,
  content text,
  token_count integer DEFAULT 0,
  processing_status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.sources(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(1024),
  metadata jsonb,
  chunk_index integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.generated_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid NOT NULL REFERENCES public.notebooks(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  media_url text,
  transcript text,
  duration_seconds integer,
  metadata jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notebooks" ON public.notebooks;
CREATE POLICY "Users can view their own notebooks"
  ON public.notebooks FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own notebooks" ON public.notebooks;
CREATE POLICY "Users can create their own notebooks"
  ON public.notebooks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own notebooks" ON public.notebooks;
CREATE POLICY "Users can update their own notebooks"
  ON public.notebooks FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own notebooks" ON public.notebooks;
CREATE POLICY "Users can delete their own notebooks"
  ON public.notebooks FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view sources in their notebooks" ON public.sources;
CREATE POLICY "Users can view sources in their notebooks"
  ON public.sources FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.notebooks
      WHERE notebooks.id = sources.notebook_id
        AND notebooks.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create sources in their notebooks" ON public.sources;
CREATE POLICY "Users can create sources in their notebooks"
  ON public.sources FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.notebooks
      WHERE notebooks.id = sources.notebook_id
        AND notebooks.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update sources in their notebooks" ON public.sources;
CREATE POLICY "Users can update sources in their notebooks"
  ON public.sources FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.notebooks
      WHERE notebooks.id = sources.notebook_id
        AND notebooks.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.notebooks
      WHERE notebooks.id = sources.notebook_id
        AND notebooks.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete sources in their notebooks" ON public.sources;
CREATE POLICY "Users can delete sources in their notebooks"
  ON public.sources FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.notebooks
      WHERE notebooks.id = sources.notebook_id
        AND notebooks.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view chunks from their sources" ON public.document_chunks;
CREATE POLICY "Users can view chunks from their sources"
  ON public.document_chunks FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.sources
      JOIN public.notebooks ON sources.notebook_id = notebooks.id
      WHERE sources.id = document_chunks.source_id
        AND notebooks.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create chunks in their sources" ON public.document_chunks;
CREATE POLICY "Users can create chunks in their sources"
  ON public.document_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sources
      JOIN public.notebooks ON sources.notebook_id = notebooks.id
      WHERE sources.id = document_chunks.source_id
        AND notebooks.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view assets from their notebooks" ON public.generated_assets;
CREATE POLICY "Users can view assets from their notebooks"
  ON public.generated_assets FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.notebooks
      WHERE notebooks.id = generated_assets.notebook_id
        AND notebooks.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can create assets in their notebooks" ON public.generated_assets;
CREATE POLICY "Users can create assets in their notebooks"
  ON public.generated_assets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.notebooks
      WHERE notebooks.id = generated_assets.notebook_id
        AND notebooks.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update assets in their notebooks" ON public.generated_assets;
CREATE POLICY "Users can update assets in their notebooks"
  ON public.generated_assets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.notebooks
      WHERE notebooks.id = generated_assets.notebook_id
        AND notebooks.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.notebooks
      WHERE notebooks.id = generated_assets.notebook_id
        AND notebooks.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete assets in their notebooks" ON public.generated_assets;
CREATE POLICY "Users can delete assets in their notebooks"
  ON public.generated_assets FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.notebooks
      WHERE notebooks.id = generated_assets.notebook_id
        AND notebooks.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_notebooks_user_id ON public.notebooks(user_id);
CREATE INDEX IF NOT EXISTS idx_sources_notebook_id ON public.sources(notebook_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_source_id ON public.document_chunks(source_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON public.document_chunks USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_generated_assets_notebook_id ON public.generated_assets(notebook_id);
CREATE INDEX IF NOT EXISTS idx_generated_assets_type ON public.generated_assets(type);
CREATE INDEX IF NOT EXISTS generated_assets_created_at_idx ON public.generated_assets(created_at DESC);
CREATE INDEX IF NOT EXISTS generated_assets_notebook_created_idx ON public.generated_assets(notebook_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.generated_assets;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
