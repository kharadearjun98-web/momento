/**
 * AI Document Generator - Core Types & Interfaces
 * 
 * Multi-agent system for generating publication-quality documents
 * with explanatory graphics, integrated with LightRAG.
 */

// ============================================================================
// DOCUMENT TYPES
// ============================================================================

export type DocumentType =
    | 'executive_summary'
    | 'research_paper'
    | 'technical_memo'
    | 'literature_review';

export type DocumentTone =
    | 'professional'
    | 'academic'
    | 'persuasive'
    | 'neutral';

export type CitationStyle =
    | 'apa7'
    | 'ieee'
    | 'chicago'
    | 'harvard';

export type VisualType =
    | 'flowchart'
    | 'diagram'
    | 'chart'
    | 'infographic'
    | 'timeline'
    | 'concept_map';

// ============================================================================
// PIPELINE STAGES
// ============================================================================

export type PipelineStage =
    | 'intent'
    | 'research'
    | 'outline'
    | 'drafting'
    | 'visualization'
    | 'quality'
    | 'formatting'
    | 'completed'
    | 'failed';

export interface PipelineProgress {
    stage: PipelineStage;
    stageProgress: number; // 0-100
    overallProgress: number; // 0-100
    message: string;
    currentSection?: string;
    error?: string;
}

export interface PipelineCheckpoint {
    stage: PipelineStage;
    timestamp: string;
    data: any;
    success: boolean;
    errorMessage?: string;
}

export interface PipelineState {
    currentStage: PipelineStage;
    progress: PipelineProgress;
    checkpoints: PipelineCheckpoint[];
    startedAt: string;
    completedAt?: string;
}

// ============================================================================
// RESEARCH & SOURCES
// ============================================================================

export interface Source {
    id: string;
    title: string;
    content: string;
    type: 'document' | 'pdf' | 'text' | 'url';
    metadata?: Record<string, any>;
}

export interface Citation {
    id: string;
    sourceId: string;
    sourceTitle: string;
    quote: string;
    page?: number;
    confidence: number;
}

export interface ResearchResult {
    sources: Source[];
    citations: Citation[];
    entities: GraphEntity[];
    relationships: GraphRelationship[];
    queryExpansions: string[];
    relevanceScores: Map<string, number>;
}

export interface GraphEntity {
    id: string;
    name: string;
    type: string;
    description: string;
    similarity?: number;
}

export interface GraphRelationship {
    id: string;
    sourceNodeName: string;
    targetNodeName: string;
    relationType: string;
    description: string;
    similarity?: number;
}

// ============================================================================
// DOCUMENT STRUCTURE
// ============================================================================

export interface DocumentOutline {
    title: string;
    abstract?: string;
    sections: OutlineSection[];
    estimatedWordCount: number;
}

export interface OutlineSection {
    id: string;
    heading: string;
    level: number; // 1, 2, 3...
    purpose: string;
    subsections: OutlineSection[];
    requiredCitations: string[];
    visualNeeded: boolean;
    targetWordCount: number;
}

export interface DocumentSection {
    id: string;
    title: string;
    content: string;
    level: number;
    citations: Citation[];
    visuals: GeneratedVisual[];
}

// ============================================================================
// VISUALS
// ============================================================================

export interface VisualRequirement {
    sectionId: string;
    type: VisualType;
    description: string;
    context: string;
    priority: 'high' | 'medium' | 'low';
}

export interface GeneratedVisual {
    id: string;
    type: VisualType;
    title: string;
    caption: string;
    // For images (DALL-E generated)
    imageBase64?: string;
    imageUrl?: string;
    // For diagrams (Mermaid)
    mermaidCode?: string;
    // Placement info
    sectionId: string;
    figureNumber?: number;
}

export interface VisualPrompt {
    type: VisualType;
    prompt: string;
    style: 'professional' | 'minimalist' | 'technical' | 'colorful';
    context: string;
}

// ============================================================================
// QUALITY ASSURANCE
// ============================================================================

export interface QualityScore {
    overall: number; // 0-1
    structure: number;
    logic: number;
    citations: number;
    readability: number;
    factualAccuracy: number;
}

export interface QualityIssue {
    id: string;
    type: 'missing_citation' | 'hallucination' | 'incoherence' | 'structure' | 'readability';
    severity: 'high' | 'medium' | 'low';
    sectionId?: string;
    description: string;
    suggestion?: string;
}

export interface QualityReport {
    score: QualityScore;
    issues: QualityIssue[];
    passedThreshold: boolean;
    recommendations: string[];
}

// ============================================================================
// GENERATED DOCUMENT
// ============================================================================

export interface GeneratedDocument {
    id: string;
    notebookId: string;
    type: DocumentType;
    title: string;
    content: string; // Full markdown content
    sections: DocumentSection[];
    visuals: GeneratedVisual[];
    citations: Citation[];
    bibliography: BibliographyEntry[];
    qualityReport: QualityReport;
    metadata: DocumentMetadata;
}

export interface BibliographyEntry {
    id: string;
    sourceId: string;
    title: string;
    formattedCitation: string;
    citationStyle: CitationStyle;
}

export interface DocumentMetadata {
    type: DocumentType;
    tone: DocumentTone;
    citationStyle: CitationStyle;
    createdAt: string;
    sourceCount: number;
    wordCount: number;
    sectionCount: number;
    visualCount: number;
    qualityScore: number;
    generationTimeMs: number;
    model: string;
}

// ============================================================================
// GENERATION OPTIONS
// ============================================================================

export interface DocumentGenerationOptions {
    type: DocumentType;
    tone?: DocumentTone;
    citationStyle?: CitationStyle;
    customPrompt?: string;

    // Visual options
    generateVisuals?: boolean;
    maxVisuals?: number;
    visualStyle?: 'professional' | 'minimalist' | 'technical' | 'colorful';

    // Quality options
    qualityThreshold?: number; // 0-1, default 0.75
    maxRetries?: number;

    // Model options
    modelQuality?: 'standard' | 'high';

    // Callbacks
    onProgress?: (progress: PipelineProgress) => void;
}

// ============================================================================
// AGENT INTERFACES
// ============================================================================

export interface AgentContext {
    notebookId: string;
    options: DocumentGenerationOptions;
    state: PipelineState;
}

export interface AgentResult<T> {
    success: boolean;
    data?: T;
    error?: string;
    processingTimeMs: number;
}

// Research Agent
export interface ResearchAgentInput {
    notebookId: string;
    documentType: DocumentType;
    customPrompt?: string;
}

export interface ResearchAgentOutput {
    research: ResearchResult;
    suggestedTitle: string;
    topicSummary: string;
}

// Reasoning Agent
export interface ReasoningAgentInput {
    research: ResearchResult;
    documentType: DocumentType;
    tone: DocumentTone;
    customPrompt?: string;
}

export interface ReasoningAgentOutput {
    outline: DocumentOutline;
    visualRequirements: VisualRequirement[];
}

// Structure Agent
export interface StructureAgentInput {
    outline: DocumentOutline;
    research: ResearchResult;
    documentType: DocumentType;
    tone: DocumentTone;
    citationStyle: CitationStyle;
}

export interface StructureAgentOutput {
    sections: DocumentSection[];
    citations: Citation[];
}

// Visualization Agent
export interface VisualizationAgentInput {
    requirements: VisualRequirement[];
    sections: DocumentSection[];
    style: 'professional' | 'minimalist' | 'technical' | 'colorful';
    maxVisuals: number;
}

export interface VisualizationAgentOutput {
    visuals: GeneratedVisual[];
}

// Quality Agent
export interface QualityAgentInput {
    sections: DocumentSection[];
    citations: Citation[];
    research: ResearchResult;
    documentType: DocumentType;
}

export interface QualityAgentOutput {
    report: QualityReport;
    correctedSections?: DocumentSection[];
}

// ============================================================================
// TEMPLATE DEFINITIONS
// ============================================================================

export interface DocumentTemplate {
    type: DocumentType;
    name: string;
    description: string;
    minWordCount: number;
    maxWordCount: number;
    requiredSections: TemplateSection[];
    optionalSections: TemplateSection[];
    flowRules: string[];
    qualityThreshold: number;
}

export interface TemplateSection {
    id: string;
    title: string;
    level: number;
    purpose: string;
    minWords?: number;
    maxWords?: number;
    required: boolean;
    subsections?: TemplateSection[];
}
