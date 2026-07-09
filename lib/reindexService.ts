import { supabase } from './supabase/client';
import { extractAndStoreGraph } from './lightrag';
import toast from 'react-hot-toast';

export interface ReindexProgress {
  current: number;
  total: number;
  currentSource: string;
  status: 'idle' | 'indexing' | 'completed' | 'error';
  message: string;
}

/**
 * Re-index all sources in a notebook to extract knowledge graph
 */
export async function reindexNotebookSources(
  notebookId: string,
  onProgress?: (progress: ReindexProgress) => void
): Promise<{ success: boolean; entitiesCreated: number; relationshipsCreated: number }> {
  console.log('🔄 Starting re-indexing for notebook:', notebookId);
  
  let entitiesCreated = 0;
  let relationshipsCreated = 0;

  try {
    // 1. Fetch all sources with their content
    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('id, title, content, type')
      .eq('notebook_id', notebookId)
      .not('content', 'is', null);

    if (sourcesError) {
      throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
    }

    if (!sources || sources.length === 0) {
      onProgress?.({
        current: 0,
        total: 0,
        currentSource: '',
        status: 'error',
        message: 'No sources found with content to index',
      });
      return { success: false, entitiesCreated: 0, relationshipsCreated: 0 };
    }

    console.log(`📚 Found ${sources.length} sources to re-index`);

    // 2. Clear existing graph data for this notebook
    onProgress?.({
      current: 0,
      total: sources.length,
      currentSource: '',
      status: 'indexing',
      message: 'Clearing existing knowledge graph...',
    });

    // Delete edges first (foreign key constraint)
    const { error: deleteEdgesError } = await supabase
      .from('graph_edges')
      .delete()
      .eq('notebook_id', notebookId);

    if (deleteEdgesError) {
      console.warn('Warning: Could not delete existing edges:', deleteEdgesError);
    }

    // Delete nodes
    const { error: deleteNodesError } = await supabase
      .from('graph_nodes')
      .delete()
      .eq('notebook_id', notebookId);

    if (deleteNodesError) {
      console.warn('Warning: Could not delete existing nodes:', deleteNodesError);
    }

    console.log('🗑️ Cleared existing graph data');

    // 3. Process each source
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      
      onProgress?.({
        current: i + 1,
        total: sources.length,
        currentSource: source.title,
        status: 'indexing',
        message: `Extracting entities from: ${source.title}`,
      });

      try {
        // Get document chunks for this source
        const { data: chunks, error: chunksError } = await supabase
          .from('document_chunks')
          .select('content')
          .eq('source_id', source.id);

        if (chunksError) {
          console.warn(`Warning: Could not fetch chunks for source ${source.id}:`, chunksError);
          continue;
        }

        // Use chunks if available, otherwise split the content
        let chunkContents: string[];
        
        if (chunks && chunks.length > 0) {
          chunkContents = chunks.map(c => c.content);
        } else if (source.content) {
          // Split content into chunks of ~1000 chars
          chunkContents = splitIntoChunks(source.content, 1000);
        } else {
          console.warn(`No content found for source: ${source.title}`);
          continue;
        }

        console.log(`   Processing ${source.title}: ${chunkContents.length} chunks`);

        // Count entities before extraction
        const { count: beforeCount } = await supabase
          .from('graph_nodes')
          .select('id', { count: 'exact', head: true })
          .eq('notebook_id', notebookId);

        // Extract and store graph
        await extractAndStoreGraph(
          source.id,
          notebookId,
          chunkContents,
          (message) => {
            onProgress?.({
              current: i + 1,
              total: sources.length,
              currentSource: source.title,
              status: 'indexing',
              message,
            });
          }
        );

        // Count entities after extraction
        const { count: afterCount } = await supabase
          .from('graph_nodes')
          .select('id', { count: 'exact', head: true })
          .eq('notebook_id', notebookId);

        entitiesCreated += (afterCount || 0) - (beforeCount || 0);

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (sourceError) {
        console.error(`Error processing source ${source.title}:`, sourceError);
        // Continue with next source
      }
    }

    // 4. Get final counts
    const { count: finalEntityCount } = await supabase
      .from('graph_nodes')
      .select('id', { count: 'exact', head: true })
      .eq('notebook_id', notebookId);

    const { count: finalRelationshipCount } = await supabase
      .from('graph_edges')
      .select('id', { count: 'exact', head: true })
      .eq('notebook_id', notebookId);

    entitiesCreated = finalEntityCount || 0;
    relationshipsCreated = finalRelationshipCount || 0;

    onProgress?.({
      current: sources.length,
      total: sources.length,
      currentSource: '',
      status: 'completed',
      message: `Completed! Created ${entitiesCreated} entities and ${relationshipsCreated} relationships`,
    });

    console.log(`✅ Re-indexing complete: ${entitiesCreated} entities, ${relationshipsCreated} relationships`);

    return { success: true, entitiesCreated, relationshipsCreated };
  } catch (error) {
    console.error('❌ Re-indexing failed:', error);
    
    onProgress?.({
      current: 0,
      total: 0,
      currentSource: '',
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error occurred',
    });

    return { success: false, entitiesCreated, relationshipsCreated };
  }
}

/**
 * Split text into chunks of approximately the given size
 */
function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!?])\s+/);
  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += ' ' + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Get knowledge graph statistics for a notebook
 */
export async function getGraphStats(notebookId: string): Promise<{
  entityCount: number;
  relationshipCount: number;
  entityTypes: Record<string, number>;
}> {
  try {
    // Get entity count
    const { count: entityCount } = await supabase
      .from('graph_nodes')
      .select('id', { count: 'exact', head: true })
      .eq('notebook_id', notebookId);

    // Get relationship count
    const { count: relationshipCount } = await supabase
      .from('graph_edges')
      .select('id', { count: 'exact', head: true })
      .eq('notebook_id', notebookId);

    // Get entity types breakdown
    const { data: typeData } = await supabase
      .from('graph_nodes')
      .select('type')
      .eq('notebook_id', notebookId);

    const entityTypes: Record<string, number> = {};
    typeData?.forEach(item => {
      entityTypes[item.type] = (entityTypes[item.type] || 0) + 1;
    });

    return {
      entityCount: entityCount || 0,
      relationshipCount: relationshipCount || 0,
      entityTypes,
    };
  } catch (error) {
    console.error('Error getting graph stats:', error);
    return { entityCount: 0, relationshipCount: 0, entityTypes: {} };
  }
}
