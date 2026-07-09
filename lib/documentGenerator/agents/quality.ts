/**
 * Quality Control Agent
 * 
 * Verifies factual accuracy, citation completeness,
 * logical coherence, and detects hallucinations.
 */

import {
    QualityAgentInput,
    QualityAgentOutput,
    QualityScore,
    QualityIssue,
    QualityReport,
    AgentResult,
    DocumentSection,
} from '../types';
import { createServerOnlyProviderClient } from '../../serverOnlyProvider';

const openai = createServerOnlyProviderClient('chat');

// ============================================================================
// QUALITY AGENT
// ============================================================================

export class QualityAgent {
    private onProgress?: (message: string, progress: number) => void;
    private qualityThreshold: number;

    constructor(
        qualityThreshold: number = 0.75,
        onProgress?: (message: string, progress: number) => void
    ) {
        this.qualityThreshold = qualityThreshold;
        this.onProgress = onProgress;
    }

    /**
     * Execute quality assurance phase
     */
    async execute(input: QualityAgentInput): Promise<AgentResult<QualityAgentOutput>> {
        const startTime = Date.now();

        try {
            console.log('✅ Quality Agent: Starting quality assurance...');
            this.reportProgress('Analyzing document quality...', 0);

            const issues: QualityIssue[] = [];

            // Step 1: Check structural completeness
            this.reportProgress('Checking structure...', 10);
            const structureIssues = this.checkStructure(input.sections, input.documentType);
            issues.push(...structureIssues);

            // Step 2: Check citation completeness
            this.reportProgress('Checking citations...', 30);
            const citationIssues = this.checkCitations(input.sections, input.citations);
            issues.push(...citationIssues);

            // Step 3: Check logical coherence (GPT-based)
            this.reportProgress('Checking coherence...', 50);
            const coherenceIssues = await this.checkCoherence(input.sections);
            issues.push(...coherenceIssues);

            // Step 4: Check for hallucinations
            this.reportProgress('Checking for hallucinations...', 70);
            const hallucinationIssues = await this.checkHallucinations(
                input.sections,
                input.research
            );
            issues.push(...hallucinationIssues);

            // Step 5: Check readability
            this.reportProgress('Checking readability...', 85);
            const readabilityScore = this.calculateReadability(input.sections);

            // Calculate overall score
            const score = this.calculateScore(issues, input.sections, readabilityScore);

            this.reportProgress('Quality check complete', 100);

            const report: QualityReport = {
                score,
                issues,
                passedThreshold: score.overall >= this.qualityThreshold,
                recommendations: this.generateRecommendations(issues),
            };

            console.log(`📊 Quality Score: ${(score.overall * 100).toFixed(1)}%`);
            console.log(`   Issues found: ${issues.length}`);
            console.log(`   Passed: ${report.passedThreshold}`);

            return {
                success: true,
                data: {
                    report,
                    correctedSections: report.passedThreshold ? undefined : await this.attemptCorrections(
                        input.sections,
                        issues
                    ),
                },
                processingTimeMs: Date.now() - startTime,
            };
        } catch (error) {
            console.error('❌ Quality Agent Error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Quality check failed',
                processingTimeMs: Date.now() - startTime,
            };
        }
    }

    /**
     * Check structural completeness
     */
    private checkStructure(sections: DocumentSection[], documentType: string): QualityIssue[] {
        const issues: QualityIssue[] = [];

        // Check for empty sections
        for (const section of sections) {
            if (!section.content || section.content.trim().length < 50) {
                issues.push({
                    id: `struct_${section.id}`,
                    type: 'structure',
                    severity: 'high',
                    sectionId: section.id,
                    description: `Section "${section.title}" has insufficient content`,
                    suggestion: 'Add more detailed content to this section',
                });
            }
        }

        // Check section count
        if (sections.length < 3) {
            issues.push({
                id: 'struct_count',
                type: 'structure',
                severity: 'medium',
                description: 'Document has fewer than 3 sections',
                suggestion: 'Consider adding more sections for comprehensive coverage',
            });
        }

        return issues;
    }

    /**
     * Check citation completeness
     */
    private checkCitations(sections: DocumentSection[], citations: any[]): QualityIssue[] {
        const issues: QualityIssue[] = [];

        for (const section of sections) {
            // Check if section has claims but no citations
            const content = section.content.toLowerCase();
            const hasClaims = content.match(/according to|research shows|studies indicate|data suggests|evidence|findings/);
            const hasCitations = section.content.match(/\[[^\]]+\]/);

            if (hasClaims && !hasCitations && section.level === 1) {
                issues.push({
                    id: `cite_${section.id}`,
                    type: 'missing_citation',
                    severity: 'medium',
                    sectionId: section.id,
                    description: `Section "${section.title}" contains claims without citations`,
                    suggestion: 'Add citations to support the claims in this section',
                });
            }
        }

        // Check if any citations are used
        if (citations.length === 0) {
            issues.push({
                id: 'cite_none',
                type: 'missing_citation',
                severity: 'high',
                description: 'Document has no citations',
                suggestion: 'Add citations from source materials to support claims',
            });
        }

        return issues;
    }

    /**
     * Check logical coherence using GPT
     */
    private async checkCoherence(sections: DocumentSection[]): Promise<QualityIssue[]> {
        if (!openai || sections.length < 2) return [];

        const issues: QualityIssue[] = [];

        try {
            const sectionSummaries = sections
                .map(s => `- ${s.title}: ${s.content.substring(0, 200)}...`)
                .join('\n');

            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'Analyze the logical coherence of a document. Return JSON with issues found.',
                    },
                    {
                        role: 'user',
                        content: `Check these document sections for logical coherence issues:

${sectionSummaries}

Return JSON array of issues (or empty array if none):
[
  {
    "sectionId": "section_id or null",
    "type": "contradiction" | "unclear_transition" | "incomplete_argument",
    "description": "Description of the issue",
    "severity": "high" | "medium" | "low"
  }
]`,
                    },
                ],
                temperature: 0.3,
                max_tokens: 500,
            });

            const content = response.choices[0]?.message?.content || '[]';
            const parsed = JSON.parse(content.replace(/```json\n?/g, '').replace(/```/g, '').trim());

            for (const issue of parsed) {
                issues.push({
                    id: `coherence_${issues.length}`,
                    type: 'incoherence',
                    severity: issue.severity || 'medium',
                    sectionId: issue.sectionId,
                    description: issue.description,
                    suggestion: 'Review and improve the logical flow',
                });
            }
        } catch (error) {
            console.warn('Coherence check failed:', error);
        }

        return issues;
    }

    /**
     * Check for hallucinations
     */
    private async checkHallucinations(
        sections: DocumentSection[],
        research: any
    ): Promise<QualityIssue[]> {
        const issues: QualityIssue[] = [];

        // Simple heuristic: check for specific claims that aren't grounded
        for (const section of sections) {
            const content = section.content.toLowerCase();

            // Look for specific numbers/statistics
            const stats = content.match(/\d+(\.\d+)?%|\d+ (percent|million|billion|thousand)/g);

            if (stats && stats.length > 0) {
                // Check if these stats appear in source content
                const sourceContent = research.sources
                    .map((s: any) => s.content.toLowerCase())
                    .join(' ');

                for (const stat of stats) {
                    if (!sourceContent.includes(stat)) {
                        issues.push({
                            id: `halluc_${section.id}_${issues.length}`,
                            type: 'hallucination',
                            severity: 'high',
                            sectionId: section.id,
                            description: `Statistic "${stat}" not found in source materials`,
                            suggestion: 'Verify this statistic or remove if not supported',
                        });
                    }
                }
            }
        }

        return issues.slice(0, 5); // Limit to 5 hallucination warnings
    }

    /**
     * Calculate readability score
     */
    private calculateReadability(sections: DocumentSection[]): number {
        const allContent = sections.map(s => s.content).join(' ');

        // Simple readability heuristics
        const words = allContent.split(/\s+/).length;
        const sentences = allContent.split(/[.!?]+/).length;
        const avgWordsPerSentence = words / Math.max(sentences, 1);

        // Score: shorter sentences = more readable
        // Ideal: 15-20 words per sentence
        if (avgWordsPerSentence >= 15 && avgWordsPerSentence <= 25) {
            return 0.9;
        } else if (avgWordsPerSentence < 15) {
            return 0.85;
        } else if (avgWordsPerSentence <= 30) {
            return 0.7;
        } else {
            return 0.5;
        }
    }

    /**
     * Calculate overall quality score
     */
    private calculateScore(
        issues: QualityIssue[],
        sections: DocumentSection[],
        readabilityScore: number
    ): QualityScore {
        // Count issues by severity
        const highIssues = issues.filter(i => i.severity === 'high').length;
        const mediumIssues = issues.filter(i => i.severity === 'medium').length;
        const lowIssues = issues.filter(i => i.severity === 'low').length;

        // Calculate component scores
        const structureIssues = issues.filter(i => i.type === 'structure').length;
        const citationIssues = issues.filter(i => i.type === 'missing_citation').length;
        const coherenceIssues = issues.filter(i => i.type === 'incoherence').length;
        const hallucinationIssues = issues.filter(i => i.type === 'hallucination').length;

        const structure = Math.max(0, 1 - (structureIssues * 0.15));
        const logic = Math.max(0, 1 - (coherenceIssues * 0.2));
        const citations = Math.max(0, 1 - (citationIssues * 0.1));
        const readability = readabilityScore;
        const factualAccuracy = Math.max(0, 1 - (hallucinationIssues * 0.2));

        // Overall: weighted average with penalty for high-severity issues
        const base = (structure * 0.2 + logic * 0.25 + citations * 0.2 +
            readability * 0.15 + factualAccuracy * 0.2);
        const penalty = highIssues * 0.05 + mediumIssues * 0.02 + lowIssues * 0.01;
        const overall = Math.max(0, Math.min(1, base - penalty));

        return {
            overall,
            structure,
            logic,
            citations,
            readability,
            factualAccuracy,
        };
    }

    /**
     * Generate recommendations based on issues
     */
    private generateRecommendations(issues: QualityIssue[]): string[] {
        const recommendations: string[] = [];

        const hasStructure = issues.some(i => i.type === 'structure');
        const hasCitation = issues.some(i => i.type === 'missing_citation');
        const hasCoherence = issues.some(i => i.type === 'incoherence');
        const hasHallucination = issues.some(i => i.type === 'hallucination');

        if (hasHallucination) {
            recommendations.push('Review and verify all statistics and specific claims against source materials');
        }
        if (hasCitation) {
            recommendations.push('Add inline citations to support key claims and findings');
        }
        if (hasCoherence) {
            recommendations.push('Improve transitions between sections for better logical flow');
        }
        if (hasStructure) {
            recommendations.push('Expand sections with insufficient content');
        }

        if (recommendations.length === 0) {
            recommendations.push('Document quality meets standards');
        }

        return recommendations;
    }

    /**
     * Attempt automatic corrections for minor issues
     */
    private async attemptCorrections(
        sections: DocumentSection[],
        issues: QualityIssue[]
    ): Promise<DocumentSection[] | undefined> {
        // Only attempt corrections for minor issues
        const minorIssues = issues.filter(i =>
            i.severity === 'low' && i.type === 'structure'
        );

        if (minorIssues.length === 0 || !openai) {
            return undefined;
        }

        // For now, return sections as-is
        // In future, could implement automatic correction
        return sections;
    }

    /**
     * Report progress to callback
     */
    private reportProgress(message: string, progress: number): void {
        this.onProgress?.(message, progress);
    }
}
