/**
 * Document Templates - Structure definitions for each document type
 */

import { DocumentTemplate, DocumentType } from '../types';

// ============================================================================
// EXECUTIVE SUMMARY TEMPLATE
// ============================================================================

export const executiveSummaryTemplate: DocumentTemplate = {
    type: 'executive_summary',
    name: 'Executive Summary',
    description: 'A concise, action-oriented summary for decision-makers (1-2 pages)',
    minWordCount: 500,
    maxWordCount: 1200,
    qualityThreshold: 0.80,
    requiredSections: [
        {
            id: 'title',
            title: 'Title',
            level: 1,
            purpose: 'Document title and date',
            required: true,
            maxWords: 20,
        },
        {
            id: 'executive_overview',
            title: 'Executive Overview',
            level: 2,
            purpose: 'High-impact opening that frames the strategic importance (2-3 sentences)',
            required: true,
            minWords: 40,
            maxWords: 80,
        },
        {
            id: 'key_findings',
            title: 'Key Findings',
            level: 2,
            purpose: 'Major findings with supporting data points (5-8 bullet points)',
            required: true,
            minWords: 150,
            maxWords: 300,
        },
        {
            id: 'implications',
            title: 'Strategic Implications',
            level: 2,
            purpose: 'Analysis of how findings affect strategy/operations',
            required: true,
            minWords: 80,
            maxWords: 200,
        },
        {
            id: 'recommendations',
            title: 'Recommendations & Next Steps',
            level: 2,
            purpose: 'Prioritized action items with timeline considerations',
            required: true,
            minWords: 100,
            maxWords: 250,
        },
        {
            id: 'conclusion',
            title: 'Conclusion',
            level: 2,
            purpose: 'Forward-looking summary with clear call to action',
            required: true,
            minWords: 40,
            maxWords: 100,
        },
    ],
    optionalSections: [],
    flowRules: [
        'Start with conclusion/recommendation (bottom-line up front)',
        'Support with selected evidence',
        'End with actionable next steps',
        'Use bullet points for key findings',
        'Minimize citations - key sources only',
    ],
};

// ============================================================================
// RESEARCH PAPER TEMPLATE
// ============================================================================

export const researchPaperTemplate: DocumentTemplate = {
    type: 'research_paper',
    name: 'Research Paper',
    description: 'Rigorous academic-style paper with deep analysis (8-15 pages)',
    minWordCount: 4000,
    maxWordCount: 8000,
    qualityThreshold: 0.85,
    requiredSections: [
        {
            id: 'title',
            title: 'Title',
            level: 1,
            purpose: 'Paper title and author(s)',
            required: true,
            maxWords: 30,
        },
        {
            id: 'abstract',
            title: 'Abstract',
            level: 2,
            purpose: 'Comprehensive overview covering purpose, methodology, findings, and conclusions',
            required: true,
            minWords: 150,
            maxWords: 300,
        },
        {
            id: 'introduction',
            title: 'Introduction',
            level: 2,
            purpose: 'Research context, problem statement, research questions, and contributions',
            required: true,
            minWords: 400,
            maxWords: 800,
            subsections: [
                { id: 'problem_statement', title: 'Problem Statement', level: 3, purpose: 'Define the problem', required: true },
                { id: 'research_questions', title: 'Research Questions', level: 3, purpose: 'State research questions', required: true },
                { id: 'contributions', title: 'Contributions', level: 3, purpose: 'Describe paper contributions', required: true },
            ],
        },
        {
            id: 'background',
            title: 'Background & Literature Review',
            level: 2,
            purpose: 'Historical context, key theories, and analysis of existing research',
            required: true,
            minWords: 600,
            maxWords: 1500,
        },
        {
            id: 'methodology',
            title: 'Methodology',
            level: 2,
            purpose: 'Analytical framework, data sources, and approach to synthesis',
            required: true,
            minWords: 300,
            maxWords: 800,
        },
        {
            id: 'findings',
            title: 'Findings & Analysis',
            level: 2,
            purpose: 'Detailed presentation of key findings with supporting evidence',
            required: true,
            minWords: 800,
            maxWords: 2000,
        },
        {
            id: 'discussion',
            title: 'Discussion',
            level: 2,
            purpose: 'Interpretation of findings, implications, and limitations',
            required: true,
            minWords: 400,
            maxWords: 1000,
        },
        {
            id: 'conclusion',
            title: 'Conclusion',
            level: 2,
            purpose: 'Summary of contributions and future research directions',
            required: true,
            minWords: 200,
            maxWords: 500,
        },
        {
            id: 'references',
            title: 'References',
            level: 2,
            purpose: 'Properly formatted bibliography',
            required: true,
        },
    ],
    optionalSections: [
        {
            id: 'appendix',
            title: 'Appendix',
            level: 2,
            purpose: 'Supplementary materials',
            required: false,
        },
    ],
    flowRules: [
        'Follow IMRaD structure for empirical papers',
        'Clear hypothesis → evidence → conclusion arc',
        'Every claim requires citation',
        'Use formal academic language',
        'Maintain scholarly objectivity',
    ],
};

// ============================================================================
// TECHNICAL MEMO TEMPLATE
// ============================================================================

export const technicalMemoTemplate: DocumentTemplate = {
    type: 'technical_memo',
    name: 'Technical Memo',
    description: 'Detailed technical memorandum for technical stakeholders (2-5 pages)',
    minWordCount: 1000,
    maxWordCount: 2500,
    qualityThreshold: 0.75,
    requiredSections: [
        {
            id: 'header',
            title: 'Memorandum Header',
            level: 1,
            purpose: 'TO, FROM, DATE, RE fields',
            required: true,
            maxWords: 50,
        },
        {
            id: 'purpose',
            title: 'Purpose & Scope',
            level: 2,
            purpose: 'Clear statement of objective and technical scope',
            required: true,
            minWords: 60,
            maxWords: 150,
        },
        {
            id: 'background',
            title: 'Background',
            level: 2,
            purpose: 'Technical context, prerequisites, and relevant history',
            required: true,
            minWords: 100,
            maxWords: 300,
        },
        {
            id: 'analysis',
            title: 'Technical Analysis',
            level: 2,
            purpose: 'Deep dive into technical details, architecture, and specifications',
            required: true,
            minWords: 300,
            maxWords: 800,
        },
        {
            id: 'findings',
            title: 'Findings',
            level: 2,
            purpose: 'Technical discoveries, root cause analysis, and dependencies',
            required: true,
            minWords: 200,
            maxWords: 500,
        },
        {
            id: 'risk_assessment',
            title: 'Risk Assessment',
            level: 2,
            purpose: 'Technical risks, security considerations, scalability concerns',
            required: true,
            minWords: 100,
            maxWords: 300,
        },
        {
            id: 'recommendations',
            title: 'Recommendations',
            level: 2,
            purpose: 'Prioritized technical recommendations with implementation approach',
            required: true,
            minWords: 150,
            maxWords: 400,
        },
        {
            id: 'action_items',
            title: 'Action Items',
            level: 2,
            purpose: 'Specific next steps with owners and milestones',
            required: true,
            minWords: 50,
            maxWords: 200,
        },
    ],
    optionalSections: [
        {
            id: 'appendix',
            title: 'Appendix',
            level: 2,
            purpose: 'Technical diagrams, reference materials, glossary',
            required: false,
        },
    ],
    flowRules: [
        'Bottom-line up front (BLUF)',
        'Use numbered lists for clarity',
        'Include timeline for actions',
        'Use precise technical terminology',
        'Include specific details and specifications',
    ],
};

// ============================================================================
// LITERATURE REVIEW TEMPLATE
// ============================================================================

export const literatureReviewTemplate: DocumentTemplate = {
    type: 'literature_review',
    name: 'Literature Review',
    description: 'Comprehensive literature review with critical analysis (10-20 pages)',
    minWordCount: 5000,
    maxWordCount: 10000,
    qualityThreshold: 0.85,
    requiredSections: [
        {
            id: 'title',
            title: 'Title',
            level: 1,
            purpose: 'Review title and author(s)',
            required: true,
            maxWords: 30,
        },
        {
            id: 'abstract',
            title: 'Abstract',
            level: 2,
            purpose: 'Overview of scope, methodology, and key themes',
            required: true,
            minWords: 100,
            maxWords: 200,
        },
        {
            id: 'introduction',
            title: 'Introduction',
            level: 2,
            purpose: 'Topic overview, review objectives, and research questions',
            required: true,
            minWords: 300,
            maxWords: 600,
        },
        {
            id: 'background',
            title: 'Background & Context',
            level: 2,
            purpose: 'Historical development, key milestones, and current state of knowledge',
            required: true,
            minWords: 400,
            maxWords: 1000,
        },
        {
            id: 'thematic_analysis',
            title: 'Thematic Analysis',
            level: 2,
            purpose: 'Analysis organized by themes with key works and contributions',
            required: true,
            minWords: 2000,
            maxWords: 5000,
            subsections: [
                { id: 'theme_1', title: 'Theme 1', level: 3, purpose: 'First thematic category', required: true },
                { id: 'theme_2', title: 'Theme 2', level: 3, purpose: 'Second thematic category', required: true },
                { id: 'theme_3', title: 'Theme 3', level: 3, purpose: 'Third thematic category', required: false },
            ],
        },
        {
            id: 'synthesis',
            title: 'Critical Synthesis',
            level: 2,
            purpose: 'Integration of findings, patterns, trends, and evolution of thought',
            required: true,
            minWords: 500,
            maxWords: 1200,
        },
        {
            id: 'gaps',
            title: 'Gaps & Opportunities',
            level: 2,
            purpose: 'Identified gaps, under-researched areas, and opportunities for future research',
            required: true,
            minWords: 300,
            maxWords: 800,
        },
        {
            id: 'implications',
            title: 'Implications',
            level: 2,
            purpose: 'Theoretical and practical implications',
            required: true,
            minWords: 200,
            maxWords: 500,
        },
        {
            id: 'conclusion',
            title: 'Conclusion',
            level: 2,
            purpose: 'Summary of key insights and recommendations for future research',
            required: true,
            minWords: 200,
            maxWords: 400,
        },
        {
            id: 'references',
            title: 'References',
            level: 2,
            purpose: 'Comprehensive bibliography',
            required: true,
        },
    ],
    optionalSections: [],
    flowRules: [
        'Organize by themes, not chronology',
        'Compare and contrast perspectives',
        'Identify consensus and controversies',
        'Highlight research gaps',
        'Critically analyze sources',
        'Synthesize insights across sources',
    ],
};

// ============================================================================
// TEMPLATE REGISTRY
// ============================================================================

export const documentTemplates: Record<DocumentType, DocumentTemplate> = {
    'executive_summary': executiveSummaryTemplate,
    'research_paper': researchPaperTemplate,
    'technical_memo': technicalMemoTemplate,
    'literature_review': literatureReviewTemplate,
};

/**
 * Get template for a document type
 */
export function getTemplate(type: DocumentType): DocumentTemplate {
    return documentTemplates[type];
}

/**
 * Get all template types with names
 */
export function getTemplateOptions(): { value: DocumentType; label: string; description: string }[] {
    return Object.values(documentTemplates).map(t => ({
        value: t.type,
        label: t.name,
        description: t.description,
    }));
}
