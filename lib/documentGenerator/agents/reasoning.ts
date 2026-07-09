/**
 * Reasoning & Synthesis Agent
 * 
 * Generates hierarchical outlines and drafts content
 * with logical coherence and inline citations.
 */

import {
    ReasoningAgentInput,
    ReasoningAgentOutput,
    DocumentOutline,
    OutlineSection,
    VisualRequirement,
    AgentResult,
    DocumentType,
    DocumentTone,
} from '../types';
import { getTemplate } from '../templates';
import { createServerOnlyProviderClient } from '../../serverOnlyProvider';

const openai = createServerOnlyProviderClient('chat');

// ============================================================================
// REASONING AGENT
// ============================================================================

export class ReasoningAgent {
    private onProgress?: (message: string, progress: number) => void;

    constructor(onProgress?: (message: string, progress: number) => void) {
        this.onProgress = onProgress;
    }

    /**
     * Execute reasoning phase - generate outline and visual requirements
     */
    async execute(input: ReasoningAgentInput): Promise<AgentResult<ReasoningAgentOutput>> {
        const startTime = Date.now();

        try {
            console.log('🧠 Reasoning Agent: Starting outline generation...');
            this.reportProgress('Analyzing research results...', 0);

            if (!openai) {
                throw new Error('OpenAI API key not configured');
            }

            // Get template for document type
            const template = getTemplate(input.documentType);

            // Step 1: Generate outline
            this.reportProgress('Generating document outline...', 20);
            const outline = await this.generateOutline(
                input.research,
                input.documentType,
                input.tone,
                input.customPrompt,
                template
            );

            console.log(`📋 Generated outline with ${outline.sections.length} sections`);

            // Step 2: Identify visual requirements
            this.reportProgress('Identifying visual opportunities...', 70);
            const visualRequirements = await this.identifyVisualRequirements(
                outline,
                input.research
            );

            console.log(`🎨 Identified ${visualRequirements.length} visual opportunities`);

            this.reportProgress('Outline complete', 100);

            return {
                success: true,
                data: {
                    outline,
                    visualRequirements,
                },
                processingTimeMs: Date.now() - startTime,
            };
        } catch (error) {
            console.error('❌ Reasoning Agent Error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Outline generation failed',
                processingTimeMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Generate document outline
     */
    private async generateOutline(
        research: ReasoningAgentInput['research'],
        documentType: DocumentType,
        tone: DocumentTone,
        customPrompt: string | undefined,
        template: any
    ): Promise<DocumentOutline> {
        // Prepare context from research
        const entityContext = research.entities
            .slice(0, 30)
            .map(e => `- ${e.name} (${e.type}): ${e.description}`)
            .join('\n');

        const relationshipContext = research.relationships
            .slice(0, 20)
            .map(r => `- ${r.sourceNodeName} → ${r.relationType} → ${r.targetNodeName}`)
            .join('\n');

        const sourceContext = research.sources
            .map(s => `- ${s.title}: ${s.content.substring(0, 500)}...`)
            .join('\n');

        const templateSections = template.requiredSections
            .map((s: any) => `- ${s.title} (${s.purpose})`)
            .join('\n');

        const prompt = `Generate a detailed document outline for a ${template.name}.

DOCUMENT TYPE: ${template.name}
DESCRIPTION: ${template.description}
TARGET WORD COUNT: ${template.minWordCount} - ${template.maxWordCount} words
TONE: ${tone}

${customPrompt ? `FOCUS/DIRECTIVE: ${customPrompt}\n` : ''}

KEY ENTITIES FROM RESEARCH:
${entityContext}

KEY RELATIONSHIPS:
${relationshipContext}

SOURCE SUMMARIES:
${sourceContext}

REQUIRED SECTIONS (from template):
${templateSections}

Generate a JSON outline with this structure:
{
  "title": "Document Title",
  "abstract": "Brief abstract if applicable",
  "sections": [
    {
      "id": "section_1",
      "heading": "Section Title",
      "level": 1,
      "purpose": "What this section covers",
      "subsections": [],
      "requiredCitations": ["source titles that should be cited"],
      "visualNeeded": true/false,
      "targetWordCount": 200
    }
  ],
  "estimatedWordCount": 2000
}

REQUIREMENTS:
1. Follow the template structure but adapt based on research content
2. Ensure logical flow between sections
3. Mark sections that would benefit from visuals (visualNeeded: true)
4. Distribute word count appropriately across sections
5. Include specific subsections where content warrants it
6. Reference specific entities/topics in section purposes

Return ONLY valid JSON, no markdown code blocks.`;

        const response = await openai!.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert document architect who creates well-structured outlines. Return only valid JSON.',
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.6,
            max_tokens: 2000,
        });

        const content = response.choices[0]?.message?.content || '';

        try {
            const cleaned = content.replace(/```json\n?/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);

            return {
                title: parsed.title || 'Document',
                abstract: parsed.abstract,
                sections: this.normalizeOutlineSections(parsed.sections || []),
                estimatedWordCount: parsed.estimatedWordCount || template.minWordCount,
            };
        } catch (parseError) {
            console.warn('Outline parsing failed, using template default');
            return this.createDefaultOutline(template, research);
        }
    }

    /**
     * Normalize outline sections from GPT response
     */
    private normalizeOutlineSections(sections: any[]): OutlineSection[] {
        return sections.map((s, index) => ({
            id: s.id || `section_${index + 1}`,
            heading: s.heading || s.title || `Section ${index + 1}`,
            level: s.level || 1,
            purpose: s.purpose || '',
            subsections: s.subsections ? this.normalizeOutlineSections(s.subsections) : [],
            requiredCitations: s.requiredCitations || [],
            visualNeeded: s.visualNeeded === true,
            targetWordCount: s.targetWordCount || 200,
        }));
    }

    /**
     * Create default outline from template
     */
    private createDefaultOutline(template: any, research: any): DocumentOutline {
        const sections: OutlineSection[] = template.requiredSections.map((s: any, index: number) => ({
            id: s.id || `section_${index + 1}`,
            heading: s.title,
            level: s.level || 1,
            purpose: s.purpose,
            subsections: s.subsections ? s.subsections.map((sub: any, subIndex: number) => ({
                id: sub.id || `subsection_${index + 1}_${subIndex + 1}`,
                heading: sub.title,
                level: sub.level || 2,
                purpose: sub.purpose,
                subsections: [],
                requiredCitations: [],
                visualNeeded: false,
                targetWordCount: Math.round((s.maxWords || 300) / (s.subsections?.length || 1)),
            })) : [],
            requiredCitations: [],
            visualNeeded: index === 0 || s.title.toLowerCase().includes('finding'),
            targetWordCount: s.maxWords || 300,
        }));

        return {
            title: research.sources[0]?.title || 'Document Analysis',
            sections,
            estimatedWordCount: template.minWordCount,
        };
    }

    /**
     * Identify visual requirements based on outline and research
     */
    private async identifyVisualRequirements(
        outline: DocumentOutline,
        research: any
    ): Promise<VisualRequirement[]> {
        const requirements: VisualRequirement[] = [];

        // Analyze each section for visual opportunities
        for (const section of outline.sections) {
            if (section.visualNeeded) {
                const visualType = this.determineVisualType(section, research);

                requirements.push({
                    sectionId: section.id,
                    type: visualType,
                    description: `Visual for: ${section.heading}`,
                    context: section.purpose,
                    priority: section.level === 1 ? 'high' : 'medium',
                });
            }

            // Check subsections
            for (const subsection of section.subsections) {
                if (subsection.visualNeeded) {
                    requirements.push({
                        sectionId: subsection.id,
                        type: this.determineVisualType(subsection, research),
                        description: `Visual for: ${subsection.heading}`,
                        context: subsection.purpose,
                        priority: 'medium',
                    });
                }
            }
        }

        // Add concept map if we have many entities
        if (research.entities.length > 10) {
            requirements.push({
                sectionId: 'overview',
                type: 'concept_map',
                description: 'Knowledge graph visualization of key concepts',
                context: 'Overview of entities and their relationships',
                priority: 'high',
            });
        }

        return requirements.slice(0, 5); // Limit to 5 visuals
    }

    /**
     * Determine best visual type for a section
     */
    private determineVisualType(
        section: OutlineSection,
        research: any
    ): VisualRequirement['type'] {
        const heading = section.heading.toLowerCase();
        const purpose = section.purpose.toLowerCase();
        const combined = `${heading} ${purpose}`;

        // Process/pipeline → Flowchart
        if (combined.match(/process|flow|step|pipeline|workflow|procedure/)) {
            return 'flowchart';
        }

        // Timeline/history → Timeline
        if (combined.match(/timeline|history|evolution|development|phase/)) {
            return 'timeline';
        }

        // Statistics/data → Chart
        if (combined.match(/data|statistic|metric|comparison|result|finding/)) {
            return 'chart';
        }

        // Architecture/system → Diagram
        if (combined.match(/architecture|system|component|structure|framework/)) {
            return 'diagram';
        }

        // Default to infographic for summaries
        if (combined.match(/summary|overview|key|highlight/)) {
            return 'infographic';
        }

        return 'diagram';
    }

    /**
     * Report progress to callback
     */
    private reportProgress(message: string, progress: number): void {
        this.onProgress?.(message, progress);
    }
}
