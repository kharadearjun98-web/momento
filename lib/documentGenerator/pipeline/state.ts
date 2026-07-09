/**
 * Pipeline State Management
 * 
 * Manages the state of document generation pipeline including
 * progress tracking, checkpoints, and error handling.
 */

import {
    PipelineState,
    PipelineProgress,
    PipelineCheckpoint,
    PipelineStage
} from '../types';

// ============================================================================
// PIPELINE STATE MANAGER
// ============================================================================

export class PipelineStateManager {
    private state: PipelineState;
    private onProgress?: (progress: PipelineProgress) => void;

    constructor(onProgress?: (progress: PipelineProgress) => void) {
        this.onProgress = onProgress;
        this.state = this.createInitialState();
    }

    /**
     * Create initial pipeline state
     */
    private createInitialState(): PipelineState {
        return {
            currentStage: 'intent',
            progress: {
                stage: 'intent',
                stageProgress: 0,
                overallProgress: 0,
                message: 'Initializing document generation...',
            },
            checkpoints: [],
            startedAt: new Date().toISOString(),
        };
    }

    /**
     * Get current state
     */
    getState(): PipelineState {
        return { ...this.state };
    }

    /**
     * Get current stage
     */
    getCurrentStage(): PipelineStage {
        return this.state.currentStage;
    }

    /**
     * Move to next stage
     */
    advanceStage(stage: PipelineStage, message: string): void {
        this.state.currentStage = stage;
        this.updateProgress({
            stage,
            stageProgress: 0,
            overallProgress: this.calculateOverallProgress(stage, 0),
            message,
        });
    }

    /**
     * Update progress within current stage
     */
    updateStageProgress(stageProgress: number, message: string, currentSection?: string): void {
        const progress: PipelineProgress = {
            stage: this.state.currentStage,
            stageProgress,
            overallProgress: this.calculateOverallProgress(this.state.currentStage, stageProgress),
            message,
            currentSection,
        };
        this.updateProgress(progress);
    }

    /**
     * Update progress and notify callback
     */
    private updateProgress(progress: PipelineProgress): void {
        this.state.progress = progress;
        this.onProgress?.(progress);

        // Log progress
        console.log(`📊 [${progress.stage}] ${progress.overallProgress}% - ${progress.message}`);
    }

    /**
     * Calculate overall progress based on stage and stage progress
     */
    private calculateOverallProgress(stage: PipelineStage, stageProgress: number): number {
        const stageWeights: Record<PipelineStage, { start: number; weight: number }> = {
            'intent': { start: 0, weight: 5 },
            'research': { start: 5, weight: 15 },
            'outline': { start: 20, weight: 10 },
            'drafting': { start: 30, weight: 35 },
            'visualization': { start: 65, weight: 15 },
            'quality': { start: 80, weight: 10 },
            'formatting': { start: 90, weight: 10 },
            'completed': { start: 100, weight: 0 },
            'failed': { start: 0, weight: 0 },
        };

        const { start, weight } = stageWeights[stage];
        return Math.min(100, Math.round(start + (weight * stageProgress / 100)));
    }

    /**
     * Save checkpoint
     */
    saveCheckpoint(data: any, success: boolean = true, errorMessage?: string): void {
        const checkpoint: PipelineCheckpoint = {
            stage: this.state.currentStage,
            timestamp: new Date().toISOString(),
            data,
            success,
            errorMessage,
        };
        this.state.checkpoints.push(checkpoint);

        console.log(`💾 Checkpoint saved for stage: ${this.state.currentStage}`);
    }

    /**
     * Get checkpoint for a stage
     */
    getCheckpoint(stage: PipelineStage): PipelineCheckpoint | undefined {
        return [...this.state.checkpoints]
            .reverse()
            .find(cp => cp.stage === stage && cp.success);
    }

    /**
     * Mark pipeline as completed
     */
    complete(): void {
        this.state.currentStage = 'completed';
        this.state.completedAt = new Date().toISOString();
        this.updateProgress({
            stage: 'completed',
            stageProgress: 100,
            overallProgress: 100,
            message: 'Document generation completed successfully!',
        });
    }

    /**
     * Mark pipeline as failed
     */
    fail(error: string): void {
        this.state.currentStage = 'failed';
        this.state.completedAt = new Date().toISOString();
        this.updateProgress({
            stage: 'failed',
            stageProgress: 0,
            overallProgress: this.state.progress.overallProgress,
            message: 'Document generation failed',
            error,
        });
    }

    /**
     * Get generation duration in milliseconds
     */
    getDuration(): number {
        const start = new Date(this.state.startedAt).getTime();
        const end = this.state.completedAt
            ? new Date(this.state.completedAt).getTime()
            : Date.now();
        return end - start;
    }

    /**
     * Check if a stage has been completed successfully
     */
    isStageComplete(stage: PipelineStage): boolean {
        const stageOrder: PipelineStage[] = [
            'intent', 'research', 'outline', 'drafting',
            'visualization', 'quality', 'formatting', 'completed'
        ];

        const currentIndex = stageOrder.indexOf(this.state.currentStage);
        const targetIndex = stageOrder.indexOf(stage);

        return currentIndex > targetIndex;
    }
}

// ============================================================================
// STAGE DEFINITIONS
// ============================================================================

export interface StageDefinition {
    stage: PipelineStage;
    name: string;
    description: string;
    checkCondition?: (data: any) => boolean;
    failureAction?: string;
}

export const STAGE_DEFINITIONS: StageDefinition[] = [
    {
        stage: 'intent',
        name: 'Intent Parsing',
        description: 'Parse user intent and determine document type',
        checkCondition: (data) => !!data.documentType,
        failureAction: 'Request clarification from user',
    },
    {
        stage: 'research',
        name: 'Research & Retrieval',
        description: 'Deep search, source gathering, citation extraction',
        checkCondition: (data) =>
            data.sources?.length >= 1 &&
            (data.averageConfidence || 0.7) >= 0.5,
        failureAction: 'Expand search queries',
    },
    {
        stage: 'outline',
        name: 'Outline Generation',
        description: 'Generate hierarchical document outline',
        checkCondition: (data) =>
            !!data.outline?.title &&
            data.outline?.sections?.length > 0,
        failureAction: 'Regenerate outline',
    },
    {
        stage: 'drafting',
        name: 'Content Drafting',
        description: 'Generate content for each section',
        checkCondition: (data) =>
            data.sections?.every((s: any) => s.content?.length > 0),
        failureAction: 'Fill incomplete sections',
    },
    {
        stage: 'visualization',
        name: 'Visual Generation',
        description: 'Generate diagrams and images',
        checkCondition: (data) => true, // Optional stage
        failureAction: 'Regenerate failed images',
    },
    {
        stage: 'quality',
        name: 'Quality Assurance',
        description: 'Verify accuracy, citations, and coherence',
        checkCondition: (data) =>
            (data.qualityScore?.overall || 0) >= 0.75,
        failureAction: 'Apply corrections and retry QA',
    },
    {
        stage: 'formatting',
        name: 'Final Formatting',
        description: 'Apply template, embed images, generate output',
        checkCondition: (data) => !!data.finalDocument,
        failureAction: 'Retry formatting',
    },
];

/**
 * Get stage definition
 */
export function getStageDefinition(stage: PipelineStage): StageDefinition | undefined {
    return STAGE_DEFINITIONS.find(s => s.stage === stage);
}

/**
 * Validate stage checkpoint
 */
export function validateStageCheckpoint(stage: PipelineStage, data: any): boolean {
    const definition = getStageDefinition(stage);
    if (!definition?.checkCondition) return true;
    return definition.checkCondition(data);
}
