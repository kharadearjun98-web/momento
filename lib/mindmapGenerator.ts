import { createServerOnlyProviderClient } from './serverOnlyProvider';
import { supabase } from './supabase/client';
import { retrieveWithLightRAG, getAllGraphData } from './lightragRetrieval';
import { MindMapStyle, GeneratedMindMap, MindMapNode, MindMapEdge } from '../types';

// AI provider calls must be routed through server-side infrastructure.
const chatProvider = createServerOnlyProviderClient('chat');

export interface MindMapGenerationOptions {
  style: MindMapStyle;
  customPrompt?: string;
}

/**
 * Generate a mind map from notebook sources using OpenAI and LightRAG
 */
export async function generateMindMap(
  notebookId: string,
  options: MindMapGenerationOptions
): Promise<GeneratedMindMap> {
  try {
    console.log('🧠 Generating mind map...');
    console.log('   Notebook ID:', notebookId);
    console.log('   Style:', options.style);

    // Fetch notebook title
    const { data: notebook, error: notebookError } = await supabase
      .from('notebooks')
      .select('title')
      .eq('id', notebookId)
      .single();

    if (notebookError) throw notebookError;

    // Fetch all sources for the notebook
    const { data: sources, error: sourcesError } = await supabase
      .from('sources')
      .select('title, content, type')
      .eq('notebook_id', notebookId);

    if (sourcesError) throw sourcesError;

    console.log(`📚 Found ${sources?.length || 0} sources`);

    if (!sources || sources.length === 0) {
      throw new Error('No sources found for this notebook. Please upload some documents first.');
    }

    // Filter sources with content
    const sourcesWithContent = sources.filter(s => s.content && s.content.trim().length > 0);

    if (sourcesWithContent.length === 0) {
      throw new Error('Sources found but none have been processed yet. Try uploading again.');
    }

    console.log(`✅ Using ${sourcesWithContent.length} sources with content`);

    // Retrieve Knowledge Graph Data (LightRAG) - this is key for mind maps!
    console.log('📊 Retrieving knowledge graph data...');

    // Get comprehensive graph data for visualization
    const graphData = await getAllGraphData(notebookId, 50);

    // Also get focused RAG context if custom prompt is provided
    const query = options.customPrompt || `Map the key concepts and relationships in ${notebook.title}`;
    const ragContext = await retrieveWithLightRAG(query, notebookId, {
      chunkCount: 10,
      entityCount: 30,
      relationshipCount: 25
    });

    console.log(`   ✓ RAG: ${ragContext.chunks.length} chunks, ${graphData.entities.length} entities, ${graphData.relationships.length} relationships`);

    // Combine source content
    const combinedContent = sourcesWithContent
      .map(s => `📄 ${s.title}\n${s.content?.substring(0, 1500) || ''}`)
      .join('\n\n');

    // Format knowledge graph context
    const entitiesContext = graphData.entities.length > 0
      ? `**Entities Found:**\n${graphData.entities.map(e => `• ${e.name} (${e.type}): ${e.description}`).join('\n')}`
      : '';

    const relationshipsContext = graphData.relationships.length > 0
      ? `**Relationships Found:**\n${graphData.relationships.map(r => `• ${r.source_node_name} → [${r.relation_type}] → ${r.target_node_name}: ${r.description || ''}`).join('\n')}`
      : '';

    // Get style-specific instructions
    const styleInstructions = getStyleInstructions(options.style);

    // Build prompt
    const prompt = `You are an expert knowledge visualization designer. Create a mind map structure based on the following content and knowledge graph.

KNOWLEDGE GRAPH DATA:
${entitiesContext}

${relationshipsContext}

SOURCE CONTENT (summary):
${combinedContent.substring(0, 8000)}

INSTRUCTIONS:
1. Create a mind map with style: ${options.style}
2. ${styleInstructions}
3. ${options.customPrompt ? `Focus specifically on: ${options.customPrompt}` : 'Cover all major concepts and their relationships.'}
4. Use the entities and relationships from the knowledge graph as the primary structure.
5. Create a clear hierarchy with one central topic and branching concepts.
6. Limit to 15-25 nodes for readability.
7. Each edge should have a meaningful relationship label when relevant.

CRITICAL: Return a valid JSON object with this EXACT structure:
{
  "centralTopic": "The main topic of the mind map",
  "nodes": [
    {
      "id": "node-1",
      "label": "Central Topic",
      "description": "Brief description of this concept",
      "type": "central"
    },
    {
      "id": "node-2", 
      "label": "Main Branch 1",
      "description": "Description of this main concept",
      "type": "main"
    },
    {
      "id": "node-3",
      "label": "Sub Topic",
      "description": "More specific detail",
      "type": "sub"
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "node-1",
      "target": "node-2",
      "label": "has aspect"
    }
  ]
}

Node types:
- "central": The main central topic (only 1)
- "main": Primary branches directly connected to central
- "sub": Secondary concepts connected to main branches
- "detail": Specific details/examples connected to sub nodes

Edge labels should describe the relationship (e.g., "contains", "leads to", "requires", "is part of", etc.)
`;

    console.log('📡 Calling Lingshi API with GPT 5.4 Mini...');

    const completion = await chatProvider.chat.completions.create({
      model: 'gpt-5.4-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert mind map generator. Always return valid JSON exactly matching the requested format. Create clear, hierarchical visualizations that help users understand complex topics.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const responseText = completion.choices[0].message.content || '{}';
    console.log('✅ Mind map generated');
    console.log(`   Response length: ${responseText.length} characters`);

    // Parse response
    let parsedNodes: MindMapNode[];
    let parsedEdges: MindMapEdge[];
    let centralTopic: string;

    try {
      const parsed = JSON.parse(responseText);
      centralTopic = parsed.centralTopic || notebook.title;
      const rawNodes = parsed.nodes || [];
      const rawEdges = parsed.edges || [];

      if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
        throw new Error('No nodes generated');
      }

      // Map and validate nodes
      parsedNodes = rawNodes.map((n: any, index: number) => ({
        id: n.id || `node-${index}`,
        label: n.label || 'Untitled',
        description: n.description || '',
        type: n.type || 'sub',
        relatedEntities: n.relatedEntities || [],
      }));

      // Map and validate edges
      parsedEdges = rawEdges.map((e: any, index: number) => ({
        id: e.id || `edge-${index}`,
        source: e.source,
        target: e.target,
        label: e.label || '',
        type: e.type || 'solid',
      }));

      // Calculate positions based on style
      parsedNodes = calculateNodePositions(parsedNodes, parsedEdges, options.style);

      console.log(`📝 Parsed ${parsedNodes.length} nodes and ${parsedEdges.length} edges`);
    } catch (parseError) {
      console.error('❌ Failed to parse mind map JSON:', parseError);
      console.error('   Raw response:', responseText.substring(0, 500));
      throw new Error('Failed to generate valid mind map. Please try again.');
    }

    // Create mind map object
    const mindmap: GeneratedMindMap = {
      id: crypto.randomUUID(),
      notebookId,
      title: `${notebook.title} - ${options.style} Mind Map`,
      centralTopic,
      nodes: parsedNodes,
      edges: parsedEdges,
      metadata: {
        style: options.style,
        nodeCount: parsedNodes.length,
        createdAt: new Date().toISOString(),
        customPrompt: options.customPrompt,
        sourceCount: sourcesWithContent.length,
      },
    };

    console.log(`✅ Mind map created: ${mindmap.title}`);
    return mindmap;

  } catch (error) {
    console.error('❌ Error generating mind map:', error);
    throw error;
  }
}

/**
 * Get style-specific layout instructions
 */
function getStyleInstructions(style: MindMapStyle): string {
  switch (style) {
    case 'Hierarchical':
      return `**Hierarchical Layout:**
- Create a tree structure with the central topic at the top
- Main branches flow downward
- Sub-branches further divide below
- Clear parent-child relationships`;

    case 'Radial':
      return `**Radial Layout:**
- Central topic at the center
- Main branches radiate outward in all directions
- Sub-topics form concentric rings
- Equal emphasis on all main branches`;

    case 'Flowchart':
      return `**Flowchart Layout:**
- Show process or sequence flow
- Use directional relationships (leads to, causes, results in)
- Clear start and end points
- Logical progression from concept to concept`;

    case 'Concept Map':
      return `**Concept Map Layout:**
- Interconnected network of ideas
- Multiple relationships between nodes (not just parent-child)
- Cross-links between different branches
- Emphasis on labeled relationships`;

    default:
      return '';
  }
}

/**
 * Calculate node positions based on layout style
 */
function calculateNodePositions(
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  style: MindMapStyle
): MindMapNode[] {
  const centerX = 400;
  const centerY = 300;

  // Find central node
  const centralNode = nodes.find(n => n.type === 'central');
  const mainNodes = nodes.filter(n => n.type === 'main');
  const subNodes = nodes.filter(n => n.type === 'sub');
  const detailNodes = nodes.filter(n => n.type === 'detail');

  // Build adjacency map
  const childMap = new Map<string, string[]>();
  edges.forEach(e => {
    if (!childMap.has(e.source)) childMap.set(e.source, []);
    childMap.get(e.source)!.push(e.target);
  });

  switch (style) {
    case 'Hierarchical':
      return calculateHierarchicalPositions(nodes, edges, centerX, centerY);

    case 'Radial':
      return calculateRadialPositions(nodes, edges, centerX, centerY);

    case 'Flowchart':
      return calculateFlowchartPositions(nodes, edges, centerX, centerY);

    case 'Concept Map':
    default:
      return calculateConceptMapPositions(nodes, edges, centerX, centerY);
  }
}

function calculateHierarchicalPositions(
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  centerX: number,
  centerY: number
): MindMapNode[] {
  // Build parent-child map
  const childMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();

  edges.forEach(e => {
    if (!childMap.has(e.source)) childMap.set(e.source, []);
    childMap.get(e.source)!.push(e.target);
    parentMap.set(e.target, e.source);
  });

  // Find root (central node or nodes without parents)
  const roots = nodes.filter(n => !parentMap.has(n.id));

  // Assign levels
  const levels = new Map<string, number>();
  const queue = roots.map(r => ({ id: r.id, level: 0 }));

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    levels.set(id, level);
    const children = childMap.get(id) || [];
    children.forEach(c => queue.push({ id: c, level: level + 1 }));
  }

  // Group nodes by level
  const nodesByLevel = new Map<number, MindMapNode[]>();
  nodes.forEach(n => {
    const level = levels.get(n.id) || 0;
    if (!nodesByLevel.has(level)) nodesByLevel.set(level, []);
    nodesByLevel.get(level)!.push(n);
  });

  // Position nodes
  const levelHeight = 120;
  const nodeSpacing = 180;

  return nodes.map(n => {
    const level = levels.get(n.id) || 0;
    const nodesAtLevel = nodesByLevel.get(level) || [];
    const indexAtLevel = nodesAtLevel.findIndex(node => node.id === n.id);
    const totalAtLevel = nodesAtLevel.length;

    const x = centerX + (indexAtLevel - (totalAtLevel - 1) / 2) * nodeSpacing;
    const y = 80 + level * levelHeight;

    return { ...n, x, y };
  });
}

function calculateRadialPositions(
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  centerX: number,
  centerY: number
): MindMapNode[] {
  const centralNode = nodes.find(n => n.type === 'central');

  // Build child map
  const childMap = new Map<string, string[]>();
  edges.forEach(e => {
    if (!childMap.has(e.source)) childMap.set(e.source, []);
    childMap.get(e.source)!.push(e.target);
  });

  // Assign rings
  const rings = new Map<string, number>();
  if (centralNode) {
    rings.set(centralNode.id, 0);
    const queue = [{ id: centralNode.id, ring: 0 }];

    while (queue.length > 0) {
      const { id, ring } = queue.shift()!;
      const children = childMap.get(id) || [];
      children.forEach(c => {
        if (!rings.has(c)) {
          rings.set(c, ring + 1);
          queue.push({ id: c, ring: ring + 1 });
        }
      });
    }
  }

  // Group nodes by ring
  const nodesByRing = new Map<number, MindMapNode[]>();
  nodes.forEach(n => {
    const ring = rings.get(n.id) || 0;
    if (!nodesByRing.has(ring)) nodesByRing.set(ring, []);
    nodesByRing.get(ring)!.push(n);
  });

  // Position nodes in rings
  const ringRadius = 140;

  return nodes.map(n => {
    const ring = rings.get(n.id) || 0;

    if (ring === 0) {
      return { ...n, x: centerX, y: centerY };
    }

    const nodesInRing = nodesByRing.get(ring) || [];
    const indexInRing = nodesInRing.findIndex(node => node.id === n.id);
    const totalInRing = nodesInRing.length;

    const angle = (2 * Math.PI * indexInRing) / totalInRing - Math.PI / 2;
    const radius = ring * ringRadius;

    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    return { ...n, x, y };
  });
}

function calculateFlowchartPositions(
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  centerX: number,
  centerY: number
): MindMapNode[] {
  // For flowchart, use horizontal flow
  const childMap = new Map<string, string[]>();
  const parentMap = new Map<string, string>();

  edges.forEach(e => {
    if (!childMap.has(e.source)) childMap.set(e.source, []);
    childMap.get(e.source)!.push(e.target);
    parentMap.set(e.target, e.source);
  });

  // Find start nodes
  const startNodes = nodes.filter(n => !parentMap.has(n.id));

  // Assign columns
  const columns = new Map<string, number>();
  const queue = startNodes.map(n => ({ id: n.id, col: 0 }));

  while (queue.length > 0) {
    const { id, col } = queue.shift()!;
    if (!columns.has(id)) {
      columns.set(id, col);
      const children = childMap.get(id) || [];
      children.forEach(c => queue.push({ id: c, col: col + 1 }));
    }
  }

  // Group by column
  const nodesByCol = new Map<number, MindMapNode[]>();
  nodes.forEach(n => {
    const col = columns.get(n.id) || 0;
    if (!nodesByCol.has(col)) nodesByCol.set(col, []);
    nodesByCol.get(col)!.push(n);
  });

  const colWidth = 200;
  const rowHeight = 100;

  return nodes.map(n => {
    const col = columns.get(n.id) || 0;
    const nodesInCol = nodesByCol.get(col) || [];
    const indexInCol = nodesInCol.findIndex(node => node.id === n.id);
    const totalInCol = nodesInCol.length;

    const x = 100 + col * colWidth;
    const y = centerY + (indexInCol - (totalInCol - 1) / 2) * rowHeight;

    return { ...n, x, y };
  });
}

function calculateConceptMapPositions(
  nodes: MindMapNode[],
  edges: MindMapEdge[],
  centerX: number,
  centerY: number
): MindMapNode[] {
  // Force-directed inspired positioning
  const centralNode = nodes.find(n => n.type === 'central');

  // Simple circular layout with central node in middle
  const otherNodes = nodes.filter(n => n.type !== 'central');

  return nodes.map((n, i) => {
    if (n.type === 'central') {
      return { ...n, x: centerX, y: centerY };
    }

    const otherIndex = otherNodes.findIndex(on => on.id === n.id);
    const total = otherNodes.length;

    // Determine radius based on type
    let radius = 200;
    if (n.type === 'main') radius = 180;
    else if (n.type === 'sub') radius = 280;
    else if (n.type === 'detail') radius = 380;

    const angle = (2 * Math.PI * otherIndex) / total - Math.PI / 2;
    // Add some variation
    const variation = (otherIndex % 2 === 0 ? 1 : 0.9);

    const x = centerX + Math.cos(angle) * radius * variation;
    const y = centerY + Math.sin(angle) * radius * variation;

    return { ...n, x, y };
  });
}

/**
 * Save mind map to database
 */
export async function saveMindMap(mindmap: GeneratedMindMap): Promise<string> {
  try {
    console.log('💾 Saving mind map to database...');

    const { data, error } = await supabase
      .from('generated_assets')
      .insert({
        notebook_id: mindmap.notebookId,
        type: 'mindmap',
        title: mindmap.title,
        metadata: {
          mindmapData: mindmap,
        },
      })
      .select('id')
      .single();

    if (error) throw error;

    console.log(`✅ Mind map saved with ID: ${data.id}`);
    return data.id;

  } catch (error) {
    console.error('❌ Error saving mind map:', error);
    throw error;
  }
}

/**
 * Load mind maps for a notebook
 */
export async function loadMindMaps(notebookId: string): Promise<GeneratedMindMap[]> {
  try {
    const { data, error } = await supabase
      .from('generated_assets')
      .select('*')
      .eq('notebook_id', notebookId)
      .eq('type', 'mindmap')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || [])
      .filter(asset => asset.metadata?.mindmapData)
      .map(asset => asset.metadata.mindmapData as GeneratedMindMap);

  } catch (error) {
    console.error('❌ Error loading mind maps:', error);
    return [];
  }
}

/**
 * Save mind map progress/state to localStorage
 */
export function saveMindMapProgress(mindmapId: string, expandedNodes: string[]): void {
  const key = `mindmap_progress_${mindmapId}`;
  try {
    localStorage.setItem(key, JSON.stringify({
      expandedNodes,
      lastViewedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.error('Failed to save mind map progress:', error);
  }
}

/**
 * Load mind map progress from localStorage
 */
export function loadMindMapProgress(mindmapId: string): { expandedNodes: string[]; lastViewedAt: string } | null {
  const key = `mindmap_progress_${mindmapId}`;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Failed to load mind map progress:', error);
  }
  return null;
}
