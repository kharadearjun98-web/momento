/**
 * Visualization Agent
 * 
 * Generates images using DALL-E and Mermaid diagrams
 * for document visuals.
 */

import {
    VisualizationAgentInput,
    VisualizationAgentOutput,
    GeneratedVisual,
    VisualRequirement,
    AgentResult,
    VisualType,
} from '../types';
import { createServerOnlyProviderClient } from '../../serverOnlyProvider';

const openai = createServerOnlyProviderClient('image');

// ============================================================================
// VISUALIZATION AGENT
// ============================================================================

export class VisualizationAgent {
    private onProgress?: (message: string, progress: number) => void;

    constructor(onProgress?: (message: string, progress: number) => void) {
        this.onProgress = onProgress;
    }

    /**
     * Execute visualization phase
     */
    async execute(input: VisualizationAgentInput): Promise<AgentResult<VisualizationAgentOutput>> {
        const startTime = Date.now();

        try {
            console.log('🎨 Visualization Agent: Starting visual generation...');
            this.reportProgress('Analyzing visual requirements...', 0);

            const visuals: GeneratedVisual[] = [];
            const requirements = input.requirements.slice(0, input.maxVisuals);

            for (let i = 0; i < requirements.length; i++) {
                const req = requirements[i];
                const progress = Math.round(((i + 1) / requirements.length) * 90);

                this.reportProgress(`Generating: ${req.description}...`, progress);

                try {
                    const visual = await this.generateVisual(req, input.sections, input.style);
                    if (visual) {
                        visuals.push(visual);
                    }
                } catch (error) {
                    console.warn(`Failed to generate visual for ${req.sectionId}:`, error);
                    // Continue with other visuals
                }
            }

            this.reportProgress('Visual generation complete', 100);

            return {
                success: true,
                data: { visuals },
                processingTimeMs: Date.now() - startTime,
            };
        } catch (error) {
            console.error('❌ Visualization Agent Error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Visual generation failed',
                processingTimeMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Generate a single visual
     */
    private async generateVisual(
        requirement: VisualRequirement,
        sections: any[],
        style: string
    ): Promise<GeneratedVisual | null> {
        // Get section content for context
        const section = sections.find(s => s.id === requirement.sectionId);
        const sectionContent = section?.content?.substring(0, 1000) || requirement.context;

        // Determine if we should use Mermaid or DALL-E
        const useMermaid = this.shouldUseMermaid(requirement.type);

        if (useMermaid) {
            return this.generateMermaidDiagram(requirement, sectionContent);
        } else {
            return this.generateDallEImage(requirement, sectionContent, style);
        }
    }

    /**
     * Check if visual type should use Mermaid
     */
    private shouldUseMermaid(type: VisualType): boolean {
        return ['flowchart', 'timeline', 'diagram', 'concept_map'].includes(type);
    }

    /**
     * Generate Mermaid diagram
     */
    private async generateMermaidDiagram(
        requirement: VisualRequirement,
        context: string
    ): Promise<GeneratedVisual | null> {
        if (!openai) return null;

        const typeInstructions: Record<string, string> = {
            'flowchart': `Use flowchart TD (top-down) format:
flowchart TD
    A[Start] --> B[Step 1]
    B --> C[Step 2]
    C --> D[End]`,
            'timeline': `Use timeline format with clear dates/phases:
timeline
    title Project Timeline
    Phase 1 : Task A
    Phase 2 : Task B`,
            'diagram': `Use graph TD for block diagrams:
graph TD
    A[Component A] --> B[Component B]
    A --> C[Component C]`,
            'concept_map': `Use flowchart LR for concept maps:
flowchart LR
    A[Main Concept] --> B[Related 1]
    A --> C[Related 2]`,
        };

        const prompt = `Generate a clean, professional Mermaid.js diagram.

TYPE: ${requirement.type}
TOPIC: ${requirement.description}
CONTEXT: ${context.substring(0, 500)}

EXAMPLE FORMAT:
${typeInstructions[requirement.type] || typeInstructions['diagram']}

STRICT RULES:
1. Start with diagram type: flowchart TD, graph LR, timeline, etc.
2. Use SHORT labels (max 4 words per node)
3. NEVER use parentheses in labels - use dashes: "Score - IS" not "Score (IS)"
4. Use simple IDs: A, B, C, D (not long names)
5. Max 8 nodes for clarity
6. Use --> for arrows
7. Add styling only if needed: style A fill:#8B5CF6

Return ONLY the Mermaid code. No markdown, no explanation.`;

        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert at creating Mermaid.js diagrams. Return only valid Mermaid syntax. NEVER use parentheses inside node labels - use dashes, colons, or quotes instead.',
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.5,
                max_tokens: 500,
            });

            let mermaidCode = response.choices[0]?.message?.content?.trim() || '';

            // Clean up the code
            mermaidCode = mermaidCode
                .replace(/```mermaid\n ?/g, '')
                .replace(/```\n?/g, '')
                .trim();

            // Sanitize: Fix parentheses in node labels
            // Convert A[Label (abbreviation)] to A["Label - abbreviation"]
            mermaidCode = this.sanitizeMermaidCode(mermaidCode);

            if (!mermaidCode) return null;

            console.log(`✅ Generated Mermaid diagram for section: ${requirement.sectionId}`);

            return {
                id: `visual_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                type: requirement.type,
                title: requirement.description,
                caption: `Diagram: ${requirement.description}`,
                mermaidCode: mermaidCode,
                sectionId: requirement.sectionId,
            };
        } catch (error) {
            console.error('Mermaid generation failed:', error);
            return null;
        }
    }

    /**
     * Sanitize Mermaid code to fix common syntax issues
     */
    private sanitizeMermaidCode(code: string): string {
        // Fix parentheses inside square bracket labels: [Text (abbrev)] -> ["Text - abbrev"]
        let sanitized = code.replace(/\[([^\]]*)\(([^)]+)\)([^\]]*)\]/g, '["$1- $2$3"]');

        // Fix nested parentheses: [Text ((nested))] -> ["Text - nested"]
        sanitized = sanitized.replace(/\[\(([^)]+)\)\]/g, '["$1"]');

        // Fix any remaining problematic parentheses in labels
        sanitized = sanitized.replace(/\[([^\]"]*)\(([^)\]]+)\)([^\]"]*)\]/g, (match, before, paren, after) => {
            return `["${before.trim()}${before.trim() ? ' - ' : ''}${paren}${after.trim() ? ' ' + after.trim() : ''}"]`;
        });

        // Ensure quoted labels don't have extra quotes
        sanitized = sanitized.replace(/\[""+/g, '["');
        sanitized = sanitized.replace(/""+\]/g, '"]');

        return sanitized;
    }

    /**
     * Generate DALL-E image
     */
    private async generateDallEImage(
        requirement: VisualRequirement,
        context: string,
        style: string
    ): Promise<GeneratedVisual | null> {
        if (!openai) return null;

        const stylePrompts: Record<string, string> = {
            'professional': 'clean professional business style, corporate colors, modern design',
            'minimalist': 'minimalist design, simple shapes, clean lines, white background',
            'technical': 'technical diagram style, precise lines, labeled components',
            'colorful': 'vibrant colors, engaging visual design, modern infographic style',
        };

        const typePrompts: Record<string, string> = {
            'chart': 'data visualization chart, clear axis labels, legend included',
            'infographic': 'infographic layout, icons, statistics highlighted',
            'diagram': 'conceptual diagram, connected elements, clear structure',
            'concept_map': 'knowledge graph visualization, interconnected nodes',
        };

        const prompt = `Create a professional ${requirement.type} visualization for a research document.

                Topic: ${requirement.description}
            Context: ${context.substring(0, 300)}

            Style: ${stylePrompts[style] || stylePrompts['professional']}
            Type: ${typePrompts[requirement.type] || typePrompts['diagram']}

            Requirements: Clean, high - quality, suitable for professional documents.Modern design.White or light background.High contrast.NO text or labels.`;

        try {
            const response = await openai.images.generate({
                model: 'dall-e-3',
                prompt,
                n: 1,
                size: '1024x1024',
                quality: 'standard',
                response_format: 'b64_json',
            });

            const b64Data = response.data[0]?.b64_json;
            if (!b64Data) {
                console.warn('No base64 data returned from DALL-E');
                return null;
            }

            const base64DataUrl = `data:image/png;base64,${b64Data}`;
            console.log(`✅ Generated DALL-E image for section: ${requirement.sectionId}`);

            return {
                id: `visual_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                type: requirement.type,
                title: requirement.description,
                caption: `Figure: ${requirement.description}`,
                imageBase64: base64DataUrl,
                sectionId: requirement.sectionId,
            };
        } catch (error) {
            console.error('DALL-E generation failed:', error);
            return null;
        }
    }

    /**
     * Report progress to callback
     */
    private reportProgress(message: string, progress: number): void {
        this.onProgress?.(message, progress);
    }
}

// ============================================================================
// MERMAID RENDERING UTILITIES
// ============================================================================

/**
 * Render Mermaid code to SVG (client-side)
 */
export async function renderMermaidToSvg(mermaidCode: string): Promise<string | null> {
    try {
        // Dynamically import mermaid if available
        const mermaid = (window as any).mermaid;
        if (!mermaid) {
            console.warn('Mermaid.js not loaded, returning raw code');
            return null;
        }

        const { svg } = await mermaid.render(`mermaid-${Date.now()}`, mermaidCode);
        return svg;
    } catch (error) {
        console.error('Mermaid rendering failed:', error);
        return null;
    }
}
