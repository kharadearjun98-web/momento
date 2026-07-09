/**
 * Document Orchestrator Agent
 * 
 * Central coordinator managing workflow, state, and agent dispatch
 * for the multi-agent document generation pipeline.
 */

import { v4 as uuidv4 } from 'uuid';
import {
    DocumentGenerationOptions,
    GeneratedDocument,
    DocumentMetadata,
    PipelineProgress,
    DocumentType,
    DocumentTone,
    CitationStyle,
    BibliographyEntry,
} from '../types';
import { PipelineStateManager } from '../pipeline/state';
import { getTemplate } from '../templates';
import { ResearchAgent } from './research';
import { ReasoningAgent } from './reasoning';
import { StructureAgent } from './structure';
import { VisualizationAgent } from './visualization';
import { QualityAgent } from './quality';

// ============================================================================
// DOCUMENT ORCHESTRATOR
// ============================================================================

export class DocumentOrchestrator {
    private stateManager: PipelineStateManager;
    private researchAgent: ResearchAgent;
    private reasoningAgent: ReasoningAgent;
    private structureAgent: StructureAgent;
    private visualizationAgent: VisualizationAgent;
    private qualityAgent: QualityAgent;

    constructor(options: DocumentGenerationOptions) {
        // Initialize state manager with progress callback
        this.stateManager = new PipelineStateManager(options.onProgress);

        // Initialize agents with progress forwarding
        this.researchAgent = new ResearchAgent((msg, prog) =>
            this.stateManager.updateStageProgress(prog, msg)
        );
        this.reasoningAgent = new ReasoningAgent((msg, prog) =>
            this.stateManager.updateStageProgress(prog, msg)
        );
        this.structureAgent = new StructureAgent((msg, prog) =>
            this.stateManager.updateStageProgress(prog, msg)
        );
        this.visualizationAgent = new VisualizationAgent((msg, prog) =>
            this.stateManager.updateStageProgress(prog, msg)
        );
        this.qualityAgent = new QualityAgent(
            options.qualityThreshold || 0.75,
            (msg, prog) => this.stateManager.updateStageProgress(prog, msg)
        );

        console.log('📋 Document Orchestrator initialized');
    }

    /**
     * Generate a complete document
     */
    async generate(
        notebookId: string,
        options: DocumentGenerationOptions
    ): Promise<GeneratedDocument> {
        const startTime = Date.now();
        const documentId = uuidv4();

        console.log('\n' + '='.repeat(60));
        console.log('📄 DOCUMENT GENERATION STARTED');
        console.log('='.repeat(60));
        console.log(`Document ID: ${documentId}`);
        console.log(`Type: ${options.type}`);
        console.log(`Tone: ${options.tone || 'professional'}`);
        console.log('='.repeat(60) + '\n');

        try {
            // ========================================================================
            // STAGE 1: INTENT PARSING
            // ========================================================================
            this.stateManager.advanceStage('intent', 'Parsing document requirements...');

            const template = getTemplate(options.type);
            const documentType = options.type;
            const tone = options.tone || 'professional';
            const citationStyle = options.citationStyle || 'apa7';

            this.stateManager.saveCheckpoint({ documentType, template, tone, citationStyle });
            console.log(`✅ Intent: ${template.name} document, ${tone} tone`);

            // ========================================================================
            // STAGE 2: RESEARCH
            // ========================================================================
            this.stateManager.advanceStage('research', 'Starting research and retrieval...');

            const researchResult = await this.researchAgent.execute({
                notebookId,
                documentType,
                customPrompt: options.customPrompt,
            });

            if (!researchResult.success || !researchResult.data) {
                throw new Error(researchResult.error || 'Research phase failed');
            }

            this.stateManager.saveCheckpoint(researchResult.data);
            console.log(`✅ Research: ${researchResult.data.research.sources.length} sources, ${researchResult.data.research.entities.length} entities`);

            // ========================================================================
            // STAGE 3: OUTLINE GENERATION
            // ========================================================================
            this.stateManager.advanceStage('outline', 'Generating document outline...');

            const reasoningResult = await this.reasoningAgent.execute({
                research: researchResult.data.research,
                documentType,
                tone,
                customPrompt: options.customPrompt,
            });

            if (!reasoningResult.success || !reasoningResult.data) {
                throw new Error(reasoningResult.error || 'Outline generation failed');
            }

            this.stateManager.saveCheckpoint(reasoningResult.data);
            console.log(`✅ Outline: "${reasoningResult.data.outline.title}" with ${reasoningResult.data.outline.sections.length} sections`);

            // ========================================================================
            // STAGE 4: DRAFTING
            // ========================================================================
            this.stateManager.advanceStage('drafting', 'Generating section content...');

            const structureResult = await this.structureAgent.execute({
                outline: reasoningResult.data.outline,
                research: researchResult.data.research,
                documentType,
                tone,
                citationStyle,
            });

            if (!structureResult.success || !structureResult.data) {
                throw new Error(structureResult.error || 'Content generation failed');
            }

            this.stateManager.saveCheckpoint(structureResult.data);
            console.log(`✅ Draft: ${structureResult.data.sections.length} sections, ${structureResult.data.citations.length} citations`);

            // ========================================================================
            // STAGE 5: VISUALIZATION
            // ========================================================================
            let visuals: any[] = [];

            if (options.generateVisuals !== false) {
                this.stateManager.advanceStage('visualization', 'Generating visuals...');

                const visualResult = await this.visualizationAgent.execute({
                    requirements: reasoningResult.data.visualRequirements,
                    sections: structureResult.data.sections,
                    style: options.visualStyle || 'professional',
                    maxVisuals: options.maxVisuals || 3,
                });

                if (visualResult.success && visualResult.data) {
                    visuals = visualResult.data.visuals;
                    this.stateManager.saveCheckpoint(visualResult.data);
                    console.log(`✅ Visuals: ${visuals.length} generated`);
                } else {
                    console.warn('⚠️ Visual generation failed, continuing without visuals');
                }
            }

            // ========================================================================
            // STAGE 6: QUALITY ASSURANCE
            // ========================================================================
            this.stateManager.advanceStage('quality', 'Running quality checks...');

            const qualityResult = await this.qualityAgent.execute({
                sections: structureResult.data.sections,
                citations: structureResult.data.citations,
                research: researchResult.data.research,
                documentType,
            });

            if (!qualityResult.success || !qualityResult.data) {
                throw new Error(qualityResult.error || 'Quality check failed');
            }

            this.stateManager.saveCheckpoint(qualityResult.data);
            console.log(`✅ Quality: ${(qualityResult.data.report.score.overall * 100).toFixed(1)}% score`);

            // Use corrected sections if available
            const finalSections = qualityResult.data.correctedSections || structureResult.data.sections;

            // ========================================================================
            // STAGE 7: FORMATTING
            // ========================================================================
            this.stateManager.advanceStage('formatting', 'Final formatting...');

            // Build final markdown content
            const finalContent = this.buildFinalContent(
                reasoningResult.data.outline,
                finalSections,
                visuals,
                structureResult.data.citations,
                citationStyle
            );

            // Build bibliography
            const bibliography = this.buildBibliography(
                researchResult.data.research.sources,
                citationStyle
            );

            // Calculate word count
            const wordCount = finalContent.split(/\s+/).length;

            // Build metadata
            const metadata: DocumentMetadata = {
                type: documentType,
                tone,
                citationStyle,
                createdAt: new Date().toISOString(),
                sourceCount: researchResult.data.research.sources.length,
                wordCount,
                sectionCount: finalSections.length,
                visualCount: visuals.length,
                qualityScore: qualityResult.data.report.score.overall,
                generationTimeMs: Date.now() - startTime,
                model: options.modelQuality === 'high' ? 'gpt-4-turbo' : 'gpt-4o',
            };

            // Mark complete
            this.stateManager.complete();

            const document: GeneratedDocument = {
                id: documentId,
                notebookId,
                type: documentType,
                title: reasoningResult.data.outline.title,
                content: finalContent,
                sections: finalSections,
                visuals,
                citations: structureResult.data.citations,
                bibliography,
                qualityReport: qualityResult.data.report,
                metadata,
            };

            console.log('\n' + '='.repeat(60));
            console.log('✅ DOCUMENT GENERATION COMPLETE');
            console.log('='.repeat(60));
            console.log(`Title: "${document.title}"`);
            console.log(`Word Count: ${wordCount}`);
            console.log(`Sections: ${finalSections.length}`);
            console.log(`Visuals: ${visuals.length}`);
            console.log(`Quality: ${(metadata.qualityScore * 100).toFixed(1)}%`);
            console.log(`Time: ${(metadata.generationTimeMs / 1000).toFixed(1)}s`);
            console.log('='.repeat(60) + '\n');

            return document;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.stateManager.fail(errorMessage);
            console.error('\n❌ DOCUMENT GENERATION FAILED:', errorMessage);
            throw error;
        }
    }

    /**
     * Build final markdown content
     */
    private buildFinalContent(
        outline: any,
        sections: any[],
        visuals: any[],
        citations: any[],
        citationStyle: CitationStyle
    ): string {
        const lines: string[] = [];
        const usedVisualIds = new Set<string>();

        // Title
        lines.push(`# ${outline.title}`);
        lines.push('');

        // Abstract if present
        if (outline.abstract) {
            lines.push('## Abstract');
            lines.push('');
            lines.push(outline.abstract);
            lines.push('');
            lines.push('---');
            lines.push('');
        }

        // Build section content with inline visuals
        console.log(`📊 Matching ${visuals.length} visuals to ${sections.length} sections...`);

        for (let i = 0; i < sections.length; i++) {
            const section = sections[i];

            // Section heading
            const headingPrefix = '#'.repeat(section.level + 1);
            lines.push(`${headingPrefix} ${section.title}`);
            lines.push('');

            // Section content
            lines.push(section.content);
            lines.push('');

            // Find visuals for this section using multiple matching strategies
            const sectionVisuals = visuals.filter(v => {
                if (usedVisualIds.has(v.id)) return false;

                // Strategy 1: Exact ID match
                if (v.sectionId === section.id) {
                    console.log(`  ✓ Matched visual "${v.title}" to section "${section.title}" (exact ID)`);
                    return true;
                }

                // Strategy 2: Section ID prefix match (e.g., "section_1" matches "section_1_2")
                const visualSectionId = (v.sectionId || '').toLowerCase();
                const sectionId = (section.id || '').toLowerCase();
                if (visualSectionId && sectionId) {
                    if (sectionId.startsWith(visualSectionId) || visualSectionId.startsWith(sectionId)) {
                        console.log(`  ✓ Matched visual "${v.title}" to section "${section.title}" (ID prefix)`);
                        return true;
                    }
                }

                // Strategy 3: Title/heading similarity
                const sectionTitle = section.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                const visualDesc = (v.description || v.title || v.caption || '').toLowerCase().replace(/[^a-z0-9]/g, '');

                // Check if visual description contains section title keywords or vice versa
                const sectionWords = section.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
                const matchingWords = sectionWords.filter(w => visualDesc.includes(w));

                if (matchingWords.length >= 2 || (matchingWords.length >= 1 && sectionWords.length <= 2)) {
                    console.log(`  ✓ Matched visual "${v.title}" to section "${section.title}" (title keywords: ${matchingWords.join(', ')})`);
                    return true;
                }

                return false;
            });

            // Add matching visuals inline after section content
            for (const visual of sectionVisuals) {
                usedVisualIds.add(visual.id);
                lines.push('');

                if (visual.mermaidCode) {
                    lines.push('```mermaid');
                    lines.push(visual.mermaidCode);
                    lines.push('```');
                    if (visual.caption) {
                        lines.push(`*${visual.caption}*`);
                    }
                } else if (visual.imageBase64) {
                    lines.push(`![${visual.caption || 'Figure'}](${visual.imageBase64})`);
                    if (visual.caption) {
                        lines.push(`*Figure: ${visual.caption}*`);
                    }
                }
                lines.push('');
            }
        }

        // Add any remaining visuals at the end under "Visual Appendix"
        const remainingVisuals = visuals.filter(v => !usedVisualIds.has(v.id));
        if (remainingVisuals.length > 0) {
            lines.push('---');
            lines.push('');
            lines.push('## Visual Appendix');
            lines.push('');

            for (const visual of remainingVisuals) {
                if (visual.mermaidCode) {
                    lines.push('```mermaid');
                    lines.push(visual.mermaidCode);
                    lines.push('```');
                    if (visual.caption) {
                        lines.push(`*${visual.caption}*`);
                    }
                } else if (visual.imageBase64) {
                    lines.push(`![${visual.caption || 'Figure'}](${visual.imageBase64})`);
                    if (visual.caption) {
                        lines.push(`*Figure: ${visual.caption}*`);
                    }
                }
                lines.push('');
            }
        }

        return lines.join('\n');
    }

    /**
     * Build bibliography entries
     */
    private buildBibliography(
        sources: any[],
        style: CitationStyle
    ): BibliographyEntry[] {
        return sources.map((source, index) => {
            let formattedCitation: string;

            switch (style) {
                case 'ieee':
                    formattedCitation = `[${index + 1}] ${source.title}.`;
                    break;
                case 'chicago':
                    formattedCitation = `${source.title}.`;
                    break;
                case 'harvard':
                    formattedCitation = `${source.title}.`;
                    break;
                case 'apa7':
                default:
                    formattedCitation = `${source.title}.`;
                    break;
            }

            return {
                id: `bib_${source.id}`,
                sourceId: source.id,
                title: source.title,
                formattedCitation,
                citationStyle: style,
            };
        });
    }
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

/**
 * Generate a document (convenience wrapper)
 */
export async function generateDocument(
    notebookId: string,
    options: DocumentGenerationOptions
): Promise<GeneratedDocument> {
    const orchestrator = new DocumentOrchestrator(options);
    return orchestrator.generate(notebookId, options);
}
