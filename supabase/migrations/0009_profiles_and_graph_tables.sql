CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  provider text,
  preferences jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE TABLE IF NOT EXISTS public.graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid REFERENCES public.notebooks(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL,
  description text,
  embedding vector(1024),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid REFERENCES public.notebooks(id) ON DELETE CASCADE,
  source_node_id uuid REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  target_node_id uuid REFERENCES public.graph_nodes(id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  description text,
  embedding vector(1024),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_edges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view graph nodes in their notebooks" ON public.graph_nodes;
CREATE POLICY "Users can view graph nodes in their notebooks"
ON public.graph_nodes FOR SELECT
USING (
  notebook_id IN (
    SELECT id FROM public.notebooks WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert graph nodes in their notebooks" ON public.graph_nodes;
CREATE POLICY "Users can insert graph nodes in their notebooks"
ON public.graph_nodes FOR INSERT
WITH CHECK (
  notebook_id IN (
    SELECT id FROM public.notebooks WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete graph nodes in their notebooks" ON public.graph_nodes;
CREATE POLICY "Users can delete graph nodes in their notebooks"
ON public.graph_nodes FOR DELETE
USING (
  notebook_id IN (
    SELECT id FROM public.notebooks WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can view graph edges in their notebooks" ON public.graph_edges;
CREATE POLICY "Users can view graph edges in their notebooks"
ON public.graph_edges FOR SELECT
USING (
  notebook_id IN (
    SELECT id FROM public.notebooks WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert graph edges in their notebooks" ON public.graph_edges;
CREATE POLICY "Users can insert graph edges in their notebooks"
ON public.graph_edges FOR INSERT
WITH CHECK (
  notebook_id IN (
    SELECT id FROM public.notebooks WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete graph edges in their notebooks" ON public.graph_edges;
CREATE POLICY "Users can delete graph edges in their notebooks"
ON public.graph_edges FOR DELETE
USING (
  notebook_id IN (
    SELECT id FROM public.notebooks WHERE user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email);
CREATE INDEX IF NOT EXISTS graph_nodes_notebook_id_idx ON public.graph_nodes(notebook_id);
CREATE INDEX IF NOT EXISTS graph_edges_notebook_id_idx ON public.graph_edges(notebook_id);
CREATE INDEX IF NOT EXISTS graph_nodes_embedding_hnsw_idx
  ON public.graph_nodes USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS graph_edges_embedding_hnsw_idx
  ON public.graph_edges USING hnsw (embedding vector_cosine_ops);
