/**
 * Structure & Format Agent
 * 
 * Generates content for each section following the outline,
 * enforcing template rules and citation requirements.
 */

import {
    StructureAgentInput,
    StructureAgentOutput,
    DocumentSection,
    Citation,
    AgentResult,
    CitationStyle,
} from '../types';
import { createServerOnlyProviderClient } from '../../serverOnlyProvider';

const openai = createServerOnlyProviderClient('chat');

// ============================================================================
// STRUCTURE AGENT
// ============================================================================

export class StructureAgent {
    private onProgress?: (message: string, progress: number) => void;

    constructor(onProgress?: (message: string, progress: number) => void) {
        this.onProgress = onProgress;
    }

    /**
     * Execute structure phase - generate section content
     */
    async execute(input: StructureAgentInput): Promise<AgentResult<StructureAgentOutput>> {
        const startTime = Date.now();

        try {
            console.log('📝 Structure Agent: Starting content generation...');
            this.reportProgress('Preparing to generate content...', 0);

            if (!openai) {
                throw new Error('OpenAI API key not configured');
            }

            const sections: DocumentSection[] = [];
            const allCitations: Citation[] = [];
            const totalSections = this.countTotalSections(input.outline.sections);
            let processedSections = 0;

            // Generate content for each section
            for (const section of input.outline.sections) {
                const sectionContent = await this.generateSectionContent(
                    section,
                    input,
                    allCitations
                );
                sections.push(sectionContent);
                allCitations.push(...sectionContent.citations);

                processedSections++;
                this.reportProgress(
                    `Generated: ${section.heading}`,
                    Math.round((processedSections / totalSections) * 90)
                );

                // Process subsections
                for (const subsection of section.subsections || []) {
                    const subContent = await this.generateSectionContent(
                        subsection,
                        input,
                        allCitations
                    );
                    sections.push(subContent);
                    allCitations.push(...subContent.citations);

                    processedSections++;
                    this.reportProgress(
                        `Generated: ${subsection.heading}`,
                        Math.round((processedSections / totalSections) * 90)
                    );
                }
            }

            this.reportProgress('Content generation complete', 100);

            return {
                success: true,
                data: {
                    sections,
                    citations: this.deduplicateCitations(allCitations),
                },
                processingTimeMs: Date.now() - startTime,
            };
        } catch (error) {
            console.error('❌ Structure Agent Error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Content generation failed',
                processingTimeMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Count total sections including subsections
     */
    private countTotalSections(sections: any[]): number {
        let count = sections.length;
        for (const section of sections) {
            if (section.subsections) {
                count += section.subsections.length;
            }
        }
        return count;
    }

    /**
     * Generate content for a single section
     */
    private async generateSectionContent(
        section: any,
        input: StructureAgentInput,
        existingCitations: Citation[]
    ): Promise<DocumentSection> {
        // Prepare context for this section
        const relevantEntities = input.research.entities
            .filter(e =>
                section.purpose.toLowerCase().includes(e.name.toLowerCase()) ||
                section.heading.toLowerCase().includes(e.name.toLowerCase())
            )
            .slice(0, 10);

        const relevantRelationships = input.research.relationships
            .filter(r =>
                relevantEntities.some(e =>
                    e.name === r.sourceNodeName || e.name === r.targetNodeName
                )
            )
            .slice(0, 8);

        // Build context
        const entityContext = relevantEntities.length > 0
            ? `Key concepts for this section:\n${relevantEntities.map(e => `- ${e.name}: ${e.description}`).join('\n')}`
            : '';

        const relationshipContext = relevantRelationships.length > 0
            ? `Relationships:\n${relevantRelationships.map(r => `- ${r.sourceNodeName} → ${r.relationType} → ${r.targetNodeName}`).join('\n')}`
            : '';

        const sourceExcerpts = input.research.sources
            .slice(0, 3)
            .map(s => `[${s.title}]: ${s.content.substring(0, 400)}...`)
            .join('\n\n');

        const toneInstructions = this.getToneInstructions(input.tone);
        const citationFormat = this.getCitationFormat(input.citationStyle);

        const prompt = `Write the content for the following section of a ${input.documentType.replace('_', ' ')}.

SECTION: ${section.heading}
LEVEL: ${section.level === 1 ? 'Main Section' : 'Subsection'}
PURPOSE: ${section.purpose}
TARGET WORDS: ${section.targetWordCount || 300}
TONE: ${toneInstructions}

${entityContext}

${relationshipContext}

SOURCE MATERIAL:
${sourceExcerpts}

CITATION STYLE: ${citationFormat}

FORMATTING REQUIREMENTS:
1. Write publication-quality content with clear, logical flow
2. Use **bold** for key terms and concepts
3. Use proper paragraph breaks (empty line between paragraphs)
4. Use bullet points (- item) for lists of 3+ items
5. Use numbered lists (1. 2. 3.) for sequential steps or ranked items
6. Include inline citations using [Source Title] format
7. Do NOT include the section heading (it will be added separately)
8. Do NOT include Mermaid diagrams or code blocks - these are added separately
9. For mathematical formulas, use LaTeX: $inline$ or $$display$$
10. Keep paragraphs concise (3-5 sentences each)
11. Start with a strong topic sentence for each paragraph
12. End sections with a clear transition or summary statement

STRUCTURE TEMPLATE:
- Opening paragraph: Introduce the main concept
- Body paragraphs: Develop ideas with evidence and examples
- Closing: Summarize key points or transition

Write exactly around ${section.targetWordCount || 300} words of clean, professional content:`;

        const response = await openai!.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `You are an expert document writer creating executive-quality, publication-ready content.

Your output must be:
- Clean and scannable with clear paragraph structure
- Professional with proper markdown formatting
- Well-organized with logical flow
- Concise yet comprehensive

Format rules:
- Use **bold** for key terms
- Use bullet points for lists
- Use proper paragraph spacing
- Use $LaTeX$ for any formulas
- Never include raw code blocks or Mermaid diagrams (handled separately)
- Always maintain ${input.tone} tone throughout`,
                },
                { role: 'user', content: prompt },
            ],
            temperature: 0.7,
            max_tokens: section.targetWordCount ? Math.max(section.targetWordCount * 2, 1000) : 1000,
        });

        const content = response.choices[0]?.message?.content || '';

        // Extract citations from content
        const sectionCitations = this.extractCitations(content, input.research.sources);

        return {
            id: section.id,
            title: section.heading,
            content,
            level: section.level,
            citations: sectionCitations,
            visuals: [],
        };
    }

    /**
     * Extract citations from generated content
     */
    private extractCitations(content: string, sources: any[]): Citation[] {
        const citations: Citation[] = [];
        const citationPattern = /\[([^\]]+)\]/g;
        let match;

        while ((match = citationPattern.exec(content)) !== null) {
            const citedText = match[1];

            // Find matching source
            const source = sources.find(s =>
                s.title.toLowerCase().includes(citedText.toLowerCase()) ||
                citedText.toLowerCase().includes(s.title.toLowerCase().substring(0, 20))
            );

            if (source) {
                citations.push({
                    id: `cite_${citations.length + 1}_${source.id.substring(0, 8)}`,
                    sourceId: source.id,
                    sourceTitle: source.title,
                    quote: content.substring(Math.max(0, match.index - 100), match.index + 100),
                    confidence: 0.85,
                });
            }
        }

        return citations;
    }

    /**
     * Deduplicate citations
     */
    private deduplicateCitations(citations: Citation[]): Citation[] {
        const seen = new Set<string>();
        return citations.filter(c => {
            const key = `${c.sourceId}_${c.quote.substring(0, 50)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /**
     * Get tone-specific instructions
     */
    private getToneInstructions(tone: string): string {
        const tones: Record<string, string> = {
            'professional': 'Use a professional, business-appropriate tone. Be clear, direct, and formal but accessible.',
            'academic': 'Use an academic tone with proper scholarly language. Cite sources and maintain objectivity.',
            'persuasive': 'Use a persuasive tone that builds compelling arguments. Include evidence and make clear recommendations.',
            'neutral': 'Use a neutral, balanced tone. Present information objectively without bias or opinion.',
        };
        return tones[tone] || tones['professional'];
    }

    /**
     * Get citation format instructions
     */
    private getCitationFormat(style: CitationStyle): string {
        const formats: Record<CitationStyle, string> = {
            'apa7': 'APA 7th Edition - (Author, Year) format',
            'ieee': 'IEEE - [Number] format',
            'chicago': 'Chicago - Footnote format',
            'harvard': 'Harvard - (Author Year) format',
        };
        return formats[style] || formats['apa7'];
    }

    /**
     * Report progress to callback
     */
    private reportProgress(message: string, progress: number): void {
        this.onProgress?.(message, progress);
    }
}
