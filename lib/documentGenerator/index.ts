/**
 * AI Document Generator
 * 
 * Multi-agent system for generating publication-quality documents
 * with explanatory graphics, integrated with LightRAG.
 * 
 * @example
 * ```typescript
 * import { generateDocument, DocumentGenerationOptions } from './lib/documentGenerator';
 * 
 * const options: DocumentGenerationOptions = {
 *   type: 'research_paper',
 *   tone: 'academic',
 *   generateVisuals: true,
 *   onProgress: (progress) => console.log(progress.message),
 * };
 * 
 * const document = await generateDocument(notebookId, options);
 * console.log(document.content);
 * ```
 */

// Main exports
export { DocumentOrchestrator, generateDocument } from './agents/orchestrator';

// Agent exports
export { ResearchAgent } from './agents/research';
export { ReasoningAgent } from './agents/reasoning';
export { StructureAgent } from './agents/structure';
export { VisualizationAgent } from './agents/visualization';
export { QualityAgent } from './agents/quality';

// Pipeline exports
export { PipelineStateManager, STAGE_DEFINITIONS } from './pipeline/state';

// Template exports
export {
    getTemplate,
    getTemplateOptions,
    documentTemplates,
    executiveSummaryTemplate,
    researchPaperTemplate,
    technicalMemoTemplate,
    literatureReviewTemplate,
} from './templates';

// Type exports
export type {
    // Document types
    DocumentType,
    DocumentTone,
    CitationStyle,
    VisualType,

    // Pipeline types
    PipelineStage,
    PipelineProgress,
    PipelineState,
    PipelineCheckpoint,

    // Research types
    Source,
    Citation,
    ResearchResult,
    GraphEntity,
    GraphRelationship,

    // Document structure
    DocumentOutline,
    OutlineSection,
    DocumentSection,

    // Visuals
    VisualRequirement,
    GeneratedVisual,
    VisualPrompt,

    // Quality
    QualityScore,
    QualityIssue,
    QualityReport,

    // Generated document
    GeneratedDocument,
    BibliographyEntry,
    DocumentMetadata,

    // Options
    DocumentGenerationOptions,

    // Agent I/O
    AgentContext,
    AgentResult,
    ResearchAgentInput,
    ResearchAgentOutput,
    ReasoningAgentInput,
    ReasoningAgentOutput,
    StructureAgentInput,
    StructureAgentOutput,
    VisualizationAgentInput,
    VisualizationAgentOutput,
    QualityAgentInput,
    QualityAgentOutput,

    // Templates
    DocumentTemplate,
    TemplateSection,
} from './types';
