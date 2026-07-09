import { generateQueryEmbedding as generateNvidiaQueryEmbedding } from './nvidiaEmbeddings';
import { supabase } from './supabase/client';

// Types
export interface DocumentChunk {
  id: string;
  content: string;
  similarity: number;
  metadata?: any;
  source_id?: string; // Added for deep linking
}

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  description: string;
  similarity: number;
  metadata?: any;
}

export interface GraphEdge {
  id: string;
  source_node_name: string;
  target_node_name: string;
  relation_type: string;
  description: string;
  similarity: number;
  metadata?: any;
}

export interface LightRAGResult {
  chunks: DocumentChunk[];
  entities: GraphNode[];
  relationships: GraphEdge[];
  formattedContext: string;
  // Map of 1-based index (as they appear in context) to chunk details
  citationMap?: Record<number, { sourceId: string; text: string; score: number }>;
}

export interface RetrievalOptions {
  chunkCount?: number;
  entityCount?: number;
  relationshipCount?: number;
  chunkWeight?: number;
  entityWeight?: number;
  relationshipWeight?: number;
  threshold?: number;
}

const DEFAULT_OPTIONS: RetrievalOptions = {
  chunkCount: 5,
  entityCount: 10,
  relationshipCount: 8,
  chunkWeight: 0.4,
  entityWeight: 0.35,
  relationshipWeight: 0.25,
  threshold: 0.5, // Lowered from 0.7 to find more matches
};

/**
 * Generate embedding for a query using NVIDIA nv-embedqa-e5-v5 (1024 dimensions)
 */
async function getQueryEmbedding(query: string): Promise<number[]> {
  return generateNvidiaQueryEmbedding(query);
}

/**
 * Retrieve relevant information using LightRAG (hybrid search)
 */
export async function retrieveWithLightRAG(
  query: string,
  notebookId: string,
  options: RetrievalOptions = {}
): Promise<LightRAGResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  console.log('🔍 LightRAG Retrieval:');
  console.log(`   Query: "${query}"`);
  console.log(`   Notebook: ${notebookId}`);

  try {
    // Generate query embedding
    const queryEmbedding = await getQueryEmbedding(query);

    // Perform parallel searches across all three data sources
    const [chunksResult, nodesResult, edgesResult] = await Promise.all([
      // 1. Search document chunks (traditional vector RAG)
      supabase.rpc('match_document_chunks', {
        query_embedding: queryEmbedding,
        match_threshold: opts.threshold!,
        match_count: opts.chunkCount!,
        notebook_id: notebookId,
      }).then(async result => {
        // Fallback if function doesn't exist
        if (result.error?.code === 'PGRST202') {
          console.warn('⚠️ match_document_chunks function not found, using fallback');
          // First get source IDs for this notebook
          const { data: sources } = await supabase
            .from('sources')
            .select('id')
            .eq('notebook_id', notebookId);

          const sourceIds = sources?.map(s => s.id) || [];

          if (sourceIds.length === 0) {
            return { data: [], error: null };
          }

          return supabase
            .from('document_chunks')
            .select('id, content, metadata, source_id')
            .in('source_id', sourceIds)
            .limit(opts.chunkCount!)
            .then(fallback => ({ ...fallback, data: fallback.data?.map(d => ({ ...d, similarity: 0.8 })) || [] }));
        }
        return result;
      }),

      // 2. Search graph nodes (entity search)
      supabase.rpc('match_graph_nodes', {
        query_embedding: queryEmbedding,
        match_threshold: opts.threshold!,
        match_count: opts.entityCount!,
        p_notebook_id: notebookId,
      }).then(async result => {
        // Fallback if function doesn't exist or any error
        if (result.error?.code === 'PGRST202' || result.error) {
          if (result.error?.code === 'PGRST202') {
            console.warn('⚠️ match_graph_nodes function not found, using fallback');
          }
          // Try to get entities from sources content extraction instead
          const fallback = await supabase
            .from('graph_nodes')
            .select('id, name, type, description, metadata')
            .eq('notebook_id', notebookId)
            .limit(opts.entityCount!);

          if (fallback.error) {
            console.warn('⚠️ graph_nodes table not accessible, extracting from sources');
            // Extract key entities from sources as fallback
            return { data: [], error: null };
          }
          return { ...fallback, data: fallback.data?.map(d => ({ ...d, similarity: 0.8 })) || [] };
        }
        return result;
      }),

      // 3. Search graph edges (relationship search)
      supabase.rpc('match_graph_edges', {
        query_embedding: queryEmbedding,
        match_threshold: opts.threshold!,
        match_count: opts.relationshipCount!,
        p_notebook_id: notebookId,
      }).then(async result => {
        // Fallback if function doesn't exist or any error
        if (result.error?.code === 'PGRST202' || result.error) {
          if (result.error?.code === 'PGRST202') {
            console.warn('⚠️ match_graph_edges function not found, using fallback');
          }
          const fallback = await supabase
            .from('graph_edges')
            .select(`
              id,
              relation_type,
              description,
              metadata,
              source:source_node_id(name),
              target:target_node_id(name)
            `)
            .eq('notebook_id', notebookId)
            .limit(opts.relationshipCount!);

          if (fallback.error) {
            console.warn('⚠️ graph_edges table not accessible');
            return { data: [], error: null };
          }
          return {
            ...fallback,
            data: fallback.data?.map((d: any) => ({
              ...d,
              source_node_name: d.source?.name || 'Unknown',
              target_node_name: d.target?.name || 'Unknown',
              similarity: 0.8
            })) || []
          };
        }
        return result;
      }),
    ]);

    // Handle errors
    if (chunksResult.error) {
      console.error('Error searching chunks:', chunksResult.error);
    }
    if (nodesResult.error) {
      console.error('Error searching nodes:', nodesResult.error);
    }
    if (edgesResult.error) {
      console.error('Error searching edges:', edgesResult.error);
    }

    const chunks: DocumentChunk[] = chunksResult.data || [];
    const entities: GraphNode[] = nodesResult.data || [];
    const relationships: GraphEdge[] = edgesResult.data || [];

    console.log(`   ✓ Found ${chunks.length} chunks, ${entities.length} entities, ${relationships.length} relationships`);

    // Format context for LLM
    const formattedContext = formatContextForLLM(chunks, entities, relationships);

    // Generate citation map (1-based index -> chunk details)
    const citationMap: Record<number, { sourceId: string; text: string; score: number }> = {};
    chunks.forEach((chunk, index) => {
      if (chunk.source_id && chunk.content) {
        citationMap[index + 1] = {
          sourceId: chunk.source_id,
          text: chunk.content,
          score: chunk.similarity
        };
      }
    });

    return {
      chunks,
      entities,
      relationships,
      formattedContext,
      citationMap
    };
  } catch (error) {
    console.error('Error in LightRAG retrieval:', error);
    throw error;
  }
}

/**
 * Format retrieved data into a context string for LLM
 */
function formatContextForLLM(
  chunks: DocumentChunk[],
  entities: GraphNode[],
  relationships: GraphEdge[]
): string {
  const sections: string[] = [];

  // 1. Document chunks section
  if (chunks.length > 0) {
    sections.push('**DOCUMENT EXCERPTS:**');
    chunks.forEach((chunk, idx) => {
      sections.push(`[${idx + 1}] ${chunk.content}`);
    });
    sections.push('');
  }

  // 2. Key entities section
  if (entities.length > 0) {
    sections.push('**KEY ENTITIES:**');
    entities.forEach((entity) => {
      sections.push(`• ${entity.name} (${entity.type}): ${entity.description}`);
    });
    sections.push('');
  }

  // 3. Relationships section
  if (relationships.length > 0) {
    sections.push('**RELATIONSHIPS:**');
    relationships.forEach((rel) => {
      sections.push(`• ${rel.source_node_name} → ${rel.relation_type} → ${rel.target_node_name}: ${rel.description}`);
    });
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Retrieve entities and relationships for a specific topic (for audio generation)
 */
export async function retrieveGraphForTopic(
  topic: string,
  notebookId: string,
  options: { entityCount?: number; relationshipCount?: number } = {}
): Promise<{ entities: GraphNode[]; relationships: GraphEdge[] }> {
  const opts = {
    entityCount: options.entityCount || 20,
    relationshipCount: options.relationshipCount || 15,
  };

  console.log(`🎯 Retrieving graph data for topic: "${topic}"`);

  try {
    const queryEmbedding = await getQueryEmbedding(topic);

    const [nodesResult, edgesResult] = await Promise.all([
      supabase.rpc('match_graph_nodes', {
        query_embedding: queryEmbedding,
        match_threshold: 0.6,
        match_count: opts.entityCount,
        p_notebook_id: notebookId,
      }).then(async result => {
        // Fallback if RPC doesn't exist
        if (result.error?.code === 'PGRST202' || result.error) {
          console.warn('⚠️ match_graph_nodes RPC not available, using direct query');
          const fallback = await supabase
            .from('graph_nodes')
            .select('id, name, type, description, metadata')
            .eq('notebook_id', notebookId)
            .limit(opts.entityCount);
          return { ...fallback, data: fallback.data?.map(d => ({ ...d, similarity: 0.8 })) || [] };
        }
        return result;
      }),

      supabase.rpc('match_graph_edges', {
        query_embedding: queryEmbedding,
        match_threshold: 0.6,
        match_count: opts.relationshipCount,
        p_notebook_id: notebookId,
      }).then(async result => {
        // Fallback if RPC doesn't exist
        if (result.error?.code === 'PGRST202' || result.error) {
          console.warn('⚠️ match_graph_edges RPC not available, using direct query');
          const fallback = await supabase
            .from('graph_edges')
            .select(`
              id,
              relation_type,
              description,
              metadata,
              source:source_node_id(name),
              target:target_node_id(name)
            `)
            .eq('notebook_id', notebookId)
            .limit(opts.relationshipCount);
          return {
            ...fallback,
            data: fallback.data?.map((d: any) => ({
              ...d,
              source_node_name: d.source?.name || 'Unknown',
              target_node_name: d.target?.name || 'Unknown',
              similarity: 0.8
            })) || []
          };
        }
        return result;
      }),
    ]);

    const entities: GraphNode[] = nodesResult.data || [];
    const relationships: GraphEdge[] = edgesResult.data || [];

    console.log(`   ✓ Retrieved ${entities.length} entities, ${relationships.length} relationships`);

    return { entities, relationships };
  } catch (error) {
    console.error('Error retrieving graph for topic:', error);
    return { entities: [], relationships: [] };
  }
}

/**
 * Get all entities and relationships for a notebook (for broad overview)
 */
export async function getAllGraphData(
  notebookId: string,
  limit: number = 50
): Promise<{ entities: GraphNode[]; relationships: GraphEdge[] }> {
  console.log(`📊 Fetching all graph data for notebook ${notebookId}`);

  try {
    const [nodesResult, edgesResult] = await Promise.all([
      supabase
        .from('graph_nodes')
        .select('id, name, type, description, metadata')
        .eq('notebook_id', notebookId)
        .limit(limit),

      supabase
        .from('graph_edges')
        .select(`
          id,
          relation_type,
          description,
          metadata,
          source:source_node_id(name),
          target:target_node_id(name)
        `)
        .eq('notebook_id', notebookId)
        .limit(limit),
    ]);

    if (nodesResult.error) {
      console.error('Error fetching nodes:', nodesResult.error);
      throw nodesResult.error;
    }

    if (edgesResult.error) {
      console.error('Error fetching edges:', edgesResult.error);
      throw edgesResult.error;
    }

    const entities = nodesResult.data.map((node: any) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      description: node.description,
      metadata: node.metadata,
      similarity: 1.0, // No similarity for direct fetch
    }));

    const relationships = edgesResult.data.map((edge: any) => ({
      id: edge.id,
      source_node_name: edge.source?.name || 'Unknown',
      target_node_name: edge.target?.name || 'Unknown',
      relation_type: edge.relation_type,
      description: edge.description,
      metadata: edge.metadata,
      similarity: 1.0,
    }));

    console.log(`   ✓ Fetched ${entities.length} entities, ${relationships.length} relationships`);

    return { entities, relationships };
  } catch (error) {
    console.error('Error getting all graph data:', error);
    return { entities: [], relationships: [] };
  }
}
