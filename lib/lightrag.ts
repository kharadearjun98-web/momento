import { createServerOnlyProviderClient } from './serverOnlyProvider';
import { supabase } from './supabase/client';
import { generateEmbeddings as generateNvidiaEmbeddings } from './nvidiaEmbeddings';

// AI provider calls must be routed through server-side infrastructure.
const chatProvider = createServerOnlyProviderClient('chat');

const openai = createServerOnlyProviderClient('openai');

// Types
export interface Entity {
  name: string;
  type: string;
  description: string;
}

export interface Relationship {
  source: string;
  target: string;
  type: string;
  description: string;
}

export interface ExtractedGraph {
  entities: Entity[];
  relationships: Relationship[];
}

export interface StoredEntity {
  id: string;
  name: string;
  type: string;
  description: string;
  embedding: number[];
}

export interface StoredRelationship {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation_type: string;
  description: string;
  embedding: number[];
}

/**
 * Extract entities and relationships from text chunks using GPT-4
 */
export async function extractEntitiesAndRelationships(
  chunks: string[],
  sourceId: string,
  batchSize: number = 5
): Promise<ExtractedGraph> {
  const allEntities: Entity[] = [];
  const allRelationships: Relationship[] = [];

  console.log(`🧠 Extracting entities and relationships from ${chunks.length} chunks...`);

  // Process chunks in batches to avoid token limits
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
    const combinedText = batch.join('\n\n---\n\n');

    console.log(`   Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}...`);

    try {
      // Use OpenAI for knowledge graph extraction (better JSON output)
      // Falls back to Lingshi GPT 5.4 if OpenAI key not available
      const client = openai || chatProvider;
      const model = openai ? 'gpt-4o-mini' : 'gpt-5.4-mini';

      console.log(`   Using ${openai ? 'OpenAI GPT-4o-mini' : 'Nemotron'} for extraction...`);

      const completion = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `You are an expert knowledge graph extractor specialized in educational content. Extract key entities and relationships from the text to help students learn.

Return ONLY valid JSON in this exact format:
{
  "entities": [
    {"name": "Entity Name", "type": "Concept|Theory|Formula|Person|Event|Definition|Method|Principle|Law|Theorem|Process|Technology|Organization|Place|Term", "description": "Clear, educational description"}
  ],
  "relationships": [
    {"source": "Entity1", "target": "Entity2", "type": "relation_type", "description": "How they relate"}
  ]
}

**Entity Types for Education:**
- **Concept**: Core ideas, abstract topics (e.g., "Machine Learning", "Photosynthesis")
- **Theory**: Scientific/academic theories (e.g., "Theory of Relativity", "Evolution")
- **Formula**: Mathematical/scientific formulas (e.g., "E=mc²", "Pythagorean Theorem")
- **Person**: Key figures, researchers, scientists, authors (e.g., "Einstein", "Darwin")
- **Event**: Historical events, discoveries, experiments (e.g., "Industrial Revolution")
- **Definition**: Important term definitions (e.g., "GDP", "Mitosis")
- **Method**: Techniques, procedures, algorithms (e.g., "Scientific Method", "Gradient Descent")
- **Principle**: Fundamental rules or guidelines (e.g., "Conservation of Energy")
- **Law**: Scientific laws (e.g., "Newton's Laws of Motion")
- **Theorem**: Mathematical theorems (e.g., "Central Limit Theorem")
- **Process**: Step-by-step processes (e.g., "Cellular Respiration", "Water Cycle")
- **Technology**: Tools, technologies, inventions (e.g., "CRISPR", "Blockchain")
- **Organization**: Academic institutions, research groups
- **Place**: Geographic locations relevant to the subject
- **Term**: Technical vocabulary, jargon that needs explanation

**Relationship Types:**
- "is_a": Category relationships (e.g., "Dog is_a Mammal")
- "part_of": Component relationships (e.g., "Mitochondria part_of Cell")
- "causes": Causal relationships (e.g., "Friction causes Heat")
- "enables": Enablement (e.g., "Photosynthesis enables Plant Growth")
- "discovered_by": Attribution (e.g., "DNA Structure discovered_by Watson and Crick")
- "proven_by": Proof relationships (e.g., "Theory proven_by Experiment")
- "depends_on": Dependencies (e.g., "Success depends_on Practice")
- "contradicts": Opposing ideas (e.g., "Theory A contradicts Theory B")
- "extends": Extensions (e.g., "Special Relativity extends Classical Mechanics")
- "applies_to": Application contexts (e.g., "Algorithm applies_to Problem Type")
- "derived_from": Derivations (e.g., "Formula derived_from Principle")
- "influences": Influence relationships
- "precedes": Temporal ordering (e.g., "Event A precedes Event B")
- "similar_to": Analogies and comparisons

**Guidelines:**
- Extract 8-20 key entities per text chunk (prioritize quality over quantity)
- Focus on learnable, testable concepts that students need to understand
- Include definitions for technical terms
- Extract formulas and their components as separate entities
- Identify cause-effect relationships, prerequisites, and dependencies
- Keep descriptions educational and clear (2-3 sentences max)
- Ensure source/target in relationships match entity names exactly
- Prioritize relationships that show how concepts connect and build on each other`,
          },
          {
            role: 'user',
            content: `Extract entities and relationships from this text:\n\n${combinedText.substring(0, 15000)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const rawContent = completion.choices[0].message.content || '';

      // Debug: Log raw response for troubleshooting
      if (!rawContent || rawContent.trim() === '') {
        console.warn(`   ⚠ Batch ${Math.floor(i / batchSize) + 1}: Empty response from model`);
        continue;
      }

      let result: { entities?: Entity[], relationships?: Relationship[] } = { entities: [], relationships: [] };

      try {
        // Try to extract JSON from the response (sometimes model wraps it in text)
        let jsonContent = rawContent;
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonContent = jsonMatch[0];
        }
        result = JSON.parse(jsonContent);
      } catch (parseError) {
        console.warn(`   ⚠ Batch ${Math.floor(i / batchSize) + 1}: JSON parse error. Response preview: ${rawContent.substring(0, 200)}`);
        continue;
      }

      if (result.entities && Array.isArray(result.entities)) {
        allEntities.push(...result.entities);
      }
      if (result.relationships && Array.isArray(result.relationships)) {
        allRelationships.push(...result.relationships);
      }

      console.log(`   ✓ Batch ${Math.floor(i / batchSize) + 1}: Found ${result.entities?.length || 0} entities, ${result.relationships?.length || 0} relationships`);

      // Log sample entities for debugging (educational context)
      if (result.entities && result.entities.length > 0) {
        const sampleEntities = result.entities.slice(0, 3).map((e: Entity) => `${e.name} (${e.type})`).join(', ');
        console.log(`      Sample entities: ${sampleEntities}`);
      }

      // Small delay to avoid rate limits
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`   ✗ Error processing batch ${Math.floor(i / batchSize) + 1}:`, error);
      // Continue with next batch even if one fails
    }
  }

  // Deduplicate entities by name (case-insensitive)
  const uniqueEntities = deduplicateEntities(allEntities);
  const uniqueRelationships = deduplicateRelationships(allRelationships);

  console.log(`✅ Extraction complete: ${uniqueEntities.length} unique entities, ${uniqueRelationships.length} unique relationships`);

  return {
    entities: uniqueEntities,
    relationships: uniqueRelationships,
  };
}

/**
 * Deduplicate entities by name (case-insensitive)
 */
function deduplicateEntities(entities: Entity[]): Entity[] {
  const seen = new Map<string, Entity>();

  for (const entity of entities) {
    const key = entity.name.toLowerCase().trim();
    if (!seen.has(key)) {
      seen.set(key, entity);
    } else {
      // Merge descriptions if entity appears multiple times
      const existing = seen.get(key)!;
      if (entity.description && entity.description.length > existing.description.length) {
        existing.description = entity.description;
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Deduplicate relationships
 */
function deduplicateRelationships(relationships: Relationship[]): Relationship[] {
  const seen = new Set<string>();
  const unique: Relationship[] = [];

  for (const rel of relationships) {
    const key = `${rel.source.toLowerCase()}|${rel.type}|${rel.target.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(rel);
    }
  }

  return unique;
}

/**
 * Generate embeddings for entities and relationships using NVIDIA nv-embedqa-e5-v5
 */
export async function generateGraphEmbeddings(
  items: Array<{ description: string }>
): Promise<number[][]> {
  if (items.length === 0) return [];

  console.log(`🔢 Generating NVIDIA nv-embedqa-e5-v5 embeddings for ${items.length} graph items...`);

  try {
    const texts = items.map(item => item.description);
    const embeddings = await generateNvidiaEmbeddings(texts);
    console.log(`✅ Generated ${embeddings.length} graph embeddings (1024D)`);
    return embeddings;
  } catch (error) {
    console.error('Error generating graph embeddings:', error);
    throw error;
  }
}

/**
 * Store entities and relationships in the database
 */
export async function storeGraphData(
  notebookId: string,
  entities: Entity[],
  relationships: Relationship[]
): Promise<void> {
  console.log(`💾 Storing graph data in database...`);

  try {
    // Generate embeddings for entities
    const entityEmbeddings = await generateGraphEmbeddings(
      entities.map(e => ({ description: `${e.name}: ${e.description}` }))
    );

    // Insert entities
    const entityInserts = entities.map((entity, idx) => ({
      notebook_id: notebookId,
      name: entity.name,
      type: entity.type,
      description: entity.description,
      embedding: entityEmbeddings[idx],
      metadata: {
        source: 'lightrag_extraction',
      },
    }));

    const { data: insertedEntities, error: entityError } = await supabase
      .from('graph_nodes')
      .insert(entityInserts)
      .select('id, name');

    if (entityError) {
      console.error('Error inserting entities:', entityError);
      throw entityError;
    }

    console.log(`   ✓ Stored ${insertedEntities.length} entities`);

    // Create a map of entity names to IDs
    const entityNameToId = new Map<string, string>();
    insertedEntities.forEach((e: any) => {
      entityNameToId.set(e.name.toLowerCase(), e.id);
    });

    // Filter relationships to only include those with valid entities
    const validRelationships = relationships.filter(rel => {
      const sourceId = entityNameToId.get(rel.source.toLowerCase());
      const targetId = entityNameToId.get(rel.target.toLowerCase());
      return sourceId && targetId;
    });

    if (validRelationships.length === 0) {
      console.log(`   ⚠ No valid relationships to store (0/${relationships.length})`);
      return;
    }

    // Generate embeddings for relationships
    const relationshipEmbeddings = await generateGraphEmbeddings(
      validRelationships.map(r => ({ description: `${r.source} ${r.type} ${r.target}: ${r.description}` }))
    );

    // Insert relationships
    const relationshipInserts = validRelationships.map((rel, idx) => ({
      notebook_id: notebookId,
      source_node_id: entityNameToId.get(rel.source.toLowerCase())!,
      target_node_id: entityNameToId.get(rel.target.toLowerCase())!,
      relation_type: rel.type,
      description: rel.description,
      embedding: relationshipEmbeddings[idx],
      metadata: {
        source: 'lightrag_extraction',
      },
    }));

    const { error: relationshipError } = await supabase
      .from('graph_edges')
      .insert(relationshipInserts);

    if (relationshipError) {
      console.error('Error inserting relationships:', relationshipError);
      throw relationshipError;
    }

    console.log(`   ✓ Stored ${validRelationships.length} relationships`);
    console.log(`✅ Graph data stored successfully`);
  } catch (error) {
    console.error('Error storing graph data:', error);
    throw error;
  }
}

/**
 * Extract and store knowledge graph from document chunks
 */
export async function extractAndStoreGraph(
  sourceId: string,
  notebookId: string,
  chunks: string[],
  onProgress?: (message: string) => void
): Promise<void> {
  try {
    console.log(`\n🔍 Starting LightRAG extraction for source ${sourceId}...`);

    onProgress?.('Extracting knowledge graph...');
    const graph = await extractEntitiesAndRelationships(chunks, sourceId);

    if (graph.entities.length === 0) {
      console.log('⚠ No entities extracted, skipping graph storage');
      return;
    }

    onProgress?.(`Storing ${graph.entities.length} entities and ${graph.relationships.length} relationships...`);
    await storeGraphData(notebookId, graph.entities, graph.relationships);

    onProgress?.(`Graph extraction complete: ${graph.entities.length} entities, ${graph.relationships.length} relationships`);
    console.log(`\n✅ LightRAG extraction complete!\n`);
  } catch (error) {
    console.error('Error in extractAndStoreGraph:', error);
    // Don't throw - allow document processing to continue even if graph extraction fails
    onProgress?.('Graph extraction failed (document still saved)');
  }
}
