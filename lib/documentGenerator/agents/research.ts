/**
 * Research & Retrieval Agent
 * 
 * Handles deep search, source gathering, and citation extraction
 * using LightRAG for hybrid retrieval.
 */

import {
    ResearchAgentInput,
    ResearchAgentOutput,
    ResearchResult,
    Source,
    Citation,
    GraphEntity,
    GraphRelationship,
    AgentResult,
    DocumentType,
} from '../types';
import {
    retrieveWithLightRAG,
    getAllGraphData,
    retrieveGraphForTopic
} from '../../lightragRetrieval';
import { supabase } from '../../supabase/client';
import { createServerOnlyProviderClient } from '../../serverOnlyProvider';

const openai = createServerOnlyProviderClient('chat');

// ============================================================================
// RESEARCH AGENT
// ============================================================================

export class ResearchAgent {
    private onProgress?: (message: string, progress: number) => void;

    constructor(onProgress?: (message: string, progress: number) => void) {
        this.onProgress = onProgress;
    }

    /**
     * Execute research phase
     */
    async execute(input: ResearchAgentInput): Promise<AgentResult<ResearchAgentOutput>> {
        const startTime = Date.now();

        try {
            console.log('🔍 Research Agent: Starting research phase...');
            this.reportProgress('Starting research...', 0);

            // Step 1: Fetch notebook sources
            this.reportProgress('Fetching notebook sources...', 10);
            const sources = await this.fetchSources(input.notebookId);

            if (sources.length === 0) {
                throw new Error('No sources found in notebook. Please upload some documents first.');
            }

            console.log(`📚 Found ${sources.length} sources`);

            // Step 2: Generate query expansions
            this.reportProgress('Expanding search queries...', 20);
            const queryExpansions = await this.expandQueries(input.documentType, input.customPrompt);
            console.log(`📝 Generated ${queryExpansions.length} query variations`);

            // Step 3: Retrieve using LightRAG
            this.reportProgress('Performing hybrid retrieval...', 40);
            const { entities, relationships, chunks } = await this.performRetrieval(
                input.notebookId,
                queryExpansions
            );

            console.log(`📊 Retrieved: ${chunks.length} chunks, ${entities.length} entities, ${relationships.length} relationships`);

            // Step 4: Build citations
            this.reportProgress('Building citations...', 70);
            const citations = this.buildCitations(sources, chunks);
            console.log(`📌 Generated ${citations.length} citations`);

            // Step 5: Generate topic summary
            this.reportProgress('Generating topic summary...', 85);
            const { title, summary } = await this.generateTopicSummary(
                sources,
                entities,
                input.customPrompt
            );

            this.reportProgress('Research complete', 100);

            const research: ResearchResult = {
                sources,
                citations,
                entities: entities.map(e => ({
                    id: e.id,
                    name: e.name,
                    type: e.type,
                    description: e.description,
                    similarity: e.similarity,
                })),
                relationships: relationships.map(r => ({
                    id: r.id,
                    sourceNodeName: r.source_node_name,
                    targetNodeName: r.target_node_name,
                    relationType: r.relation_type,
                    description: r.description,
                    similarity: r.similarity,
                })),
                queryExpansions,
                relevanceScores: new Map(sources.map(s => [s.id, 0.8])),
            };

            return {
                success: true,
                data: {
                    research,
                    suggestedTitle: title,
                    topicSummary: summary,
                },
                processingTimeMs: Date.now() - startTime,
            };
        } catch (error) {
            console.error('❌ Research Agent Error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Research failed',
                processingTimeMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Fetch sources from notebook
     */
    private async fetchSources(notebookId: string): Promise<Source[]> {
        const { data, error } = await supabase
            .from('sources')
            .select('id, title, content, type')
            .eq('notebook_id', notebookId);

        if (error) throw error;

        return (data || [])
            .filter(s => s.content && s.content.trim().length > 0)
            .map(s => ({
                id: s.id,
                title: s.title || 'Untitled',
                content: s.content || '',
                type: s.type as Source['type'],
            }));
    }

    /**
     * Expand queries for multi-query retrieval
     */
    private async expandQueries(
        documentType: DocumentType,
        customPrompt?: string
    ): Promise<string[]> {
        const baseQueries: string[] = [];

        // Add custom prompt as primary query
        if (customPrompt) {
            baseQueries.push(customPrompt);
        }

        // Document type specific queries
        const typeQueries: Record<DocumentType, string[]> = {
            'executive_summary': [
                'key findings and main conclusions',
                'strategic implications and recommendations',
                'action items and next steps',
            ],
            'research_paper': [
                'theoretical background and context',
                'methodology and approach',
                'key findings and evidence',
                'implications and future research',
            ],
            'technical_memo': [
                'technical analysis and specifications',
                'risk assessment and considerations',
                'implementation recommendations',
            ],
            'literature_review': [
                'major themes and perspectives',
                'areas of consensus and controversy',
                'research gaps and opportunities',
            ],
        };

        baseQueries.push(...(typeQueries[documentType] || []));

        // Use GPT to generate additional query variations if available
        if (openai && customPrompt) {
            try {
                const response = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'Generate 3 diverse search queries to research the given topic. Return only the queries, one per line.',
                        },
                        {
                            role: 'user',
                            content: `Topic: ${customPrompt}\nDocument type: ${documentType}`,
                        },
                    ],
                    temperature: 0.7,
                    max_tokens: 200,
                });

                const additionalQueries = response.choices[0]?.message?.content
                    ?.split('\n')
                    .filter(q => q.trim().length > 0)
                    .map(q => q.replace(/^\d+\.\s*/, '').trim()) || [];

                baseQueries.push(...additionalQueries);
            } catch (error) {
                console.warn('Query expansion failed, using base queries:', error);
            }
        }

        return [...new Set(baseQueries)]; // Deduplicate
    }

    /**
     * Perform hybrid retrieval using LightRAG
     */
    private async performRetrieval(
        notebookId: string,
        queries: string[]
    ): Promise<{
        entities: any[];
        relationships: any[];
        chunks: any[];
    }> {
        const allEntities: any[] = [];
        const allRelationships: any[] = [];
        const allChunks: any[] = [];
        const seenIds = new Set<string>();

        // Retrieve for each query
        for (const query of queries.slice(0, 5)) { // Limit to 5 queries
            try {
                const result = await retrieveWithLightRAG(query, notebookId, {
                    chunkCount: 10,
                    entityCount: 15,
                    relationshipCount: 10,
                });

                // Deduplicate and collect
                for (const entity of result.entities) {
                    if (!seenIds.has(`entity_${entity.id}`)) {
                        seenIds.add(`entity_${entity.id}`);
                        allEntities.push(entity);
                    }
                }

                for (const rel of result.relationships) {
                    if (!seenIds.has(`rel_${rel.id}`)) {
                        seenIds.add(`rel_${rel.id}`);
                        allRelationships.push(rel);
                    }
                }

                for (const chunk of result.chunks) {
                    if (!seenIds.has(`chunk_${chunk.id}`)) {
                        seenIds.add(`chunk_${chunk.id}`);
                        allChunks.push(chunk);
                    }
                }
            } catch (error) {
                console.warn(`Retrieval failed for query "${query}":`, error);
            }
        }

        // Also get broad graph data
        try {
            const graphData = await getAllGraphData(notebookId, 50);

            for (const entity of graphData.entities) {
                if (!seenIds.has(`entity_${entity.id}`)) {
                    seenIds.add(`entity_${entity.id}`);
                    allEntities.push(entity);
                }
            }

            for (const rel of graphData.relationships) {
                if (!seenIds.has(`rel_${rel.id}`)) {
                    seenIds.add(`rel_${rel.id}`);
                    allRelationships.push(rel);
                }
            }
        } catch (error) {
            console.warn('Graph data retrieval failed:', error);
        }

        return {
            entities: allEntities,
            relationships: allRelationships,
            chunks: allChunks,
        };
    }

    /**
     * Build citations from sources and chunks
     */
    private buildCitations(sources: Source[], chunks: any[]): Citation[] {
        const citations: Citation[] = [];

        // Create citations from chunks
        for (const chunk of chunks) {
            const source = sources.find(s =>
                chunk.content && s.content.includes(chunk.content.substring(0, 100))
            );

            if (source) {
                citations.push({
                    id: `cite_${citations.length + 1}`,
                    sourceId: source.id,
                    sourceTitle: source.title,
                    quote: chunk.content.substring(0, 300),
                    confidence: chunk.similarity || 0.8,
                });
            }
        }

        // Ensure at least one citation per source
        for (const source of sources) {
            const hasCitation = citations.some(c => c.sourceId === source.id);
            if (!hasCitation) {
                citations.push({
                    id: `cite_${citations.length + 1}`,
                    sourceId: source.id,
                    sourceTitle: source.title,
                    quote: source.content.substring(0, 300),
                    confidence: 0.7,
                });
            }
        }

        return citations;
    }

    /**
     * Generate topic summary and suggested title
     */
    private async generateTopicSummary(
        sources: Source[],
        entities: any[],
        customPrompt?: string
    ): Promise<{ title: string; summary: string }> {
        if (!openai) {
            // Fallback without OpenAI
            const topEntities = entities.slice(0, 5).map(e => e.name).join(', ');
            return {
                title: customPrompt || `Analysis of ${sources[0]?.title || 'Documents'}`,
                summary: `Analysis covering: ${topEntities || 'various topics from the provided sources'}.`,
            };
        }

        try {
            const entityNames = entities.slice(0, 20).map(e => `${e.name} (${e.type})`).join(', ');
            const sourceTitles = sources.map(s => s.title).join(', ');

            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'Generate a concise title and 2-sentence summary for a document based on the sources and topics. Return JSON: {"title": "...", "summary": "..."}',
                    },
                    {
                        role: 'user',
                        content: `Sources: ${sourceTitles}\nKey topics: ${entityNames}\n${customPrompt ? `Focus: ${customPrompt}` : ''}`,
                    },
                ],
                temperature: 0.5,
                max_tokens: 200,
            });

            const content = response.choices[0]?.message?.content || '';
            const parsed = JSON.parse(content.replace(/```json\n?/g, '').replace(/```/g, '').trim());

            return {
                title: parsed.title || customPrompt || 'Document Analysis',
                summary: parsed.summary || 'Comprehensive analysis of the provided sources.',
            };
        } catch (error) {
            console.warn('Topic summary generation failed:', error);
            return {
                title: customPrompt || `Analysis of ${sources[0]?.title || 'Documents'}`,
                summary: 'Comprehensive analysis of the provided sources.',
            };
        }
    }

    /**
     * Report progress to callback
     */
    private reportProgress(message: string, progress: number): void {
        this.onProgress?.(message, progress);
    }
}
