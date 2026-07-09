CREATE OR REPLACE FUNCTION public.match_document_chunks(
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  notebook_id uuid
)
RETURNS TABLE (
  id uuid,
  source_id uuid,
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
    dc.source_id,
    dc.content,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM public.document_chunks dc
  JOIN public.sources s ON s.id = dc.source_id
  WHERE s.notebook_id = match_document_chunks.notebook_id
    AND dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_graph_nodes(
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  p_notebook_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  description text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    gn.id,
    gn.name,
    gn.type,
    gn.description,
    gn.metadata,
    1 - (gn.embedding <=> query_embedding) as similarity
  FROM public.graph_nodes gn
  WHERE gn.notebook_id = p_notebook_id
    AND gn.embedding IS NOT NULL
    AND 1 - (gn.embedding <=> query_embedding) > match_threshold
  ORDER BY gn.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_graph_edges(
  query_embedding vector(1024),
  match_threshold float,
  match_count int,
  p_notebook_id uuid
)
RETURNS TABLE (
  id uuid,
  source_node_name text,
  target_node_name text,
  relation_type text,
  description text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ge.id,
    sn.name as source_node_name,
    tn.name as target_node_name,
    ge.relation_type,
    ge.description,
    ge.metadata,
    1 - (ge.embedding <=> query_embedding) as similarity
  FROM public.graph_edges ge
  JOIN public.graph_nodes sn ON sn.id = ge.source_node_id
  JOIN public.graph_nodes tn ON tn.id = ge.target_node_id
  WHERE ge.notebook_id = p_notebook_id
    AND ge.embedding IS NOT NULL
    AND 1 - (ge.embedding <=> query_embedding) > match_threshold
  ORDER BY ge.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
