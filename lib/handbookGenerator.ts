/**
 * Handbook Generator
 * 
 * Generates structured handbooks (Study Guide, Cheatsheet, Briefing, Comprehensive)
 * using GPT 5.4 via Lingshi with master agent approach for long content.
 */

import { createServerOnlyProviderClient } from './serverOnlyProvider';
import { supabase } from './supabase/client';
import { retrieveWithLightRAG, getAllGraphData, retrieveGraphForTopic } from './lightragRetrieval';
import { HandbookFormat, HandbookLength, HandbookSection, HandbookTOCEntry, GeneratedHandbook } from '../types';

// AI provider calls must be routed through server-side infrastructure.
const chatProvider = createServerOnlyProviderClient('chat');

// Model configuration
const CHAT_MODEL = 'gpt-5.4-mini';

// =============================================================================
// TYPES
// =============================================================================

export interface HandbookGenerationOptions {
    format: HandbookFormat;
    length: HandbookLength;
    customPrompt?: string;
    onProgress?: (progress: HandbookProgress) => void;
}

export interface HandbookProgress {
    phase: 'research' | 'outline' | 'content' | 'continuation' | 'finalization' | 'saving' | 'completed';
    overallProgress: number;
    currentSection: number;
    totalSections: number;
    message: string;
    wordCount?: number;
    targetWordCount?: number;
}

// HandbookSection, GeneratedHandbook, HandbookTOCEntry imported from types.ts

// =============================================================================
// FORMAT TEMPLATES
// =============================================================================

function getTargetWordCount(length: HandbookLength): number {
    switch (length) {
        case '5 Pages': return 2500; // ~500 words per page
        case '15 Pages': return 7500;
        case '30+ Pages': return 15000;
        default: return 2500;
    }
}

function getMaxContinuations(length: HandbookLength): number {
    switch (length) {
        case '5 Pages': return 2;
        case '15 Pages': return 5;
        case '30+ Pages': return 12;
        default: return 2;
    }
}

function getFormatInstructions(format: HandbookFormat): string {
    switch (format) {
        case 'Study Guide':
            return `Create a COMPREHENSIVE STUDY GUIDE with the following structure:

## Study Guide Structure

### 1. Introduction & Learning Objectives
- Clear introduction to the material
- 5-10 specific learning objectives (what the reader will master)
- Prerequisites and recommended prior knowledge
- How to use this guide effectively

### 2. Core Concepts Overview
- Visual concept map or summary table
- Key terminology definitions
- Foundational principles explained clearly

### 3. Main Chapters (Multiple detailed sections)
For EACH major topic, include:
- **Chapter Introduction**: Why this topic matters
- **Key Concepts**: Detailed explanations with examples
- **Important Formulas/Rules**: Clearly formatted and explained
- **Worked Examples**: Step-by-step problem-solving
- **Common Misconceptions**: What to avoid
- **Practice Questions**: Self-assessment with answers
- **Chapter Summary**: Key takeaways in bullet points

### 4. Deep Dive Sections
- Advanced topics and extensions
- Real-world applications
- Case studies or scenarios

### 5. Review & Consolidation
- Comprehensive summary of all topics
- Quick reference tables
- Master checklist of concepts
- Final practice test with answer key

### 6. Appendices
- Glossary of terms
- Formula sheet
- Additional resources for further study

IMPORTANT: Each chapter should be DETAILED and THOROUGH. Include specific facts, data, examples, and explanations. The guide should be genuinely educational and usable for actual studying.`;

        case 'Cheatsheet':
            return `Create a DENSE, QUICK-REFERENCE CHEATSHEET with the following structure:

## Cheatsheet Structure

### Header Section
- Title and scope
- Quick legend/color coding explanation

### Core Content (Organized by Category)

#### Definitions & Key Terms
| Term | Definition |
|------|------------|
| ... | ... |

#### Essential Formulas
- Formula 1: [formula] - [when to use]
- Formula 2: [formula] - [when to use]

#### Key Rules & Principles
1. Rule name: Brief explanation
2. Rule name: Brief explanation

#### Decision Trees / Flowcharts
- If X then Y, else Z
- Quick decision guides

#### Common Patterns
- Pattern recognition guides
- Standard approaches

#### Quick Reference Tables
- Comparison tables
- Lookup tables
- Conversion charts

#### Mnemonics & Memory Aids
- Acronyms
- Memory tricks
- Association techniques

#### Common Mistakes to Avoid
⚠️ Mistake 1: How to avoid
⚠️ Mistake 2: How to avoid

#### Quick Examples
- Example 1: Brief worked solution
- Example 2: Brief worked solution

IMPORTANT: Maximize information density. Use tables, bullet points, and compact formatting. Every word should be useful. This is for quick reference, not learning from scratch.`;

        case 'Briefing':
            return `Create an EXECUTIVE BRIEFING DOCUMENT with the following structure:

## Briefing Structure

### Executive Summary
- 3-4 sentence overview of the entire topic
- Key insight or finding upfront

### Background & Context
- Why this topic matters
- Current situation overview
- Stakeholder relevance

### Key Points (5-8 major points)
Each point should include:
- **Main Finding/Insight**
- **Supporting Evidence**
- **Implications**

### Critical Analysis
- Strengths and weaknesses
- Opportunities and threats
- Risk assessment

### Data & Evidence Summary
- Key statistics and metrics
- Source credibility assessment
- Data visualizations (described)

### Recommendations
- Prioritized action items
- Implementation considerations
- Timeline suggestions

### Conclusion
- Forward-looking summary
- Call to action
- Key takeaway

### Appendix
- Detailed data tables
- Source references
- Supporting documentation

IMPORTANT: Use professional, authoritative language. Be concise but comprehensive. Focus on actionable insights and clear recommendations. Suitable for senior decision-makers.`;

        case 'Comprehensive':
            return `Create a COMPREHENSIVE HANDBOOK/TEXTBOOK with the following structure:

## Comprehensive Handbook Structure

### Front Matter
- Title page
- Table of Contents (detailed)
- Preface/Introduction to the Reader
- How to Use This Handbook

### Part I: Foundations
#### Chapter 1: Introduction
- Overview of the subject
- Historical context and development
- Scope and importance
- Key terminology

#### Chapter 2: Fundamental Concepts
- Core theories and principles
- Building blocks of understanding
- Essential prerequisites

### Part II: Core Content (Multiple Chapters)
For EACH major topic area, create a FULL CHAPTER with:
- Chapter introduction and objectives
- Detailed explanation of concepts
- Theoretical frameworks
- Mathematical formulas (if applicable)
- Diagrams and visual descriptions
- Practical examples
- Case studies
- Exercises and solutions
- Chapter summary and key points
- Further reading suggestions

### Part III: Advanced Topics
- Complex applications
- Edge cases and special situations
- Cutting-edge developments
- Expert-level techniques

### Part IV: Practical Applications
- Real-world scenarios
- Industry applications
- Worked case studies
- Best practices

### Part V: Review & Reference
- Comprehensive review questions
- Practice problems with solutions
- Quick reference guides
- Summary tables

### Back Matter
- Comprehensive glossary
- Index
- Bibliography
- Appendices with supplementary material

IMPORTANT: This should be a COMPLETE, STANDALONE REFERENCE. Every section should be detailed enough that a reader can learn the topic thoroughly. Include specific facts, data, examples, and explanations. Aim for textbook-quality depth and clarity.`;

        default:
            return 'Create a well-structured, comprehensive handbook covering all major topics.';
    }
}

// =============================================================================
// MAIN GENERATION FUNCTION
// =============================================================================

export async function generateHandbook(
    notebookId: string,
    options: HandbookGenerationOptions
): Promise<GeneratedHandbook> {
    console.log('\n' + '='.repeat(60));
    console.log('📚 HANDBOOK GENERATION MASTER AGENT');
    console.log('='.repeat(60));
    console.log(`Notebook: ${notebookId}`);
    console.log(`Format: ${options.format}`);
    console.log(`Length: ${options.length}`);
    console.log('='.repeat(60) + '\n');

    const targetWords = getTargetWordCount(options.length);
    const maxContinuations = getMaxContinuations(options.length);

    const reportProgress = (progress: HandbookProgress) => {
        options.onProgress?.(progress);
        console.log(`📊 Progress: ${progress.phase} - ${progress.message} (${progress.overallProgress}%)`);
    };

    try {
        // =========================================================================
        // PHASE 1: RESEARCH - Gather context
        // =========================================================================
        reportProgress({
            phase: 'research',
            overallProgress: 5,
            currentSection: 0,
            totalSections: 0,
            message: 'Gathering source materials...',
        });

        // Fetch notebook info
        const { data: notebook, error: notebookError } = await supabase
            .from('notebooks')
            .select('title')
            .eq('id', notebookId)
            .single();

        if (notebookError) throw notebookError;

        // Fetch sources
        const { data: sources, error: sourcesError } = await supabase
            .from('sources')
            .select('id, title, content, type')
            .eq('notebook_id', notebookId);

        if (sourcesError) throw sourcesError;

        if (!sources || sources.length === 0) {
            throw new Error('No sources found. Please upload documents first.');
        }

        const sourcesWithContent = sources.filter(s => s.content?.trim());
        console.log(`✅ Found ${sourcesWithContent.length} sources with content`);

        // Get knowledge graph data
        reportProgress({
            phase: 'research',
            overallProgress: 10,
            currentSection: 0,
            totalSections: 0,
            message: 'Extracting knowledge graph...',
        });

        let graphData = { entities: [], relationships: [] };
        try {
            if (options.customPrompt) {
                graphData = await retrieveGraphForTopic(options.customPrompt, notebookId, {
                    entityCount: 40,
                    relationshipCount: 30,
                });
            } else {
                graphData = await getAllGraphData(notebookId, 80);
            }
        } catch (error) {
            console.warn('⚠️ Knowledge graph retrieval failed:', error);
        }

        // Get RAG context
        const query = options.customPrompt || `Create a ${options.format} about ${notebook.title}`;
        let ragContext = { chunks: [], entities: [], relationships: [], formattedContext: '' };
        try {
            ragContext = await retrieveWithLightRAG(query, notebookId, { chunkCount: 30 });
        } catch (error) {
            console.warn('⚠️ RAG retrieval failed:', error);
        }

        console.log(`✅ Research: ${ragContext.chunks.length} chunks, ${graphData.entities.length} entities`);

        // =========================================================================
        // PHASE 2: OUTLINE - Generate structure
        // =========================================================================
        reportProgress({
            phase: 'outline',
            overallProgress: 15,
            currentSection: 0,
            totalSections: 0,
            message: 'Generating handbook outline...',
        });

        const outlinePrompt = buildOutlinePrompt(
            notebook.title,
            options.format,
            options.length,
            options.customPrompt,
            graphData,
            sourcesWithContent
        );

        const outlineResponse = await chatProvider.chat.completions.create({
            model: CHAT_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert educator and technical writer. Generate detailed, logical outlines for educational materials.',
                },
                { role: 'user', content: outlinePrompt },
            ],
            temperature: 0.6,
            max_tokens: 2000,
        });

        const outlineContent = outlineResponse.choices[0]?.message?.content || '';
        console.log('✅ Outline generated');

        // =========================================================================
        // PHASE 3: CONTENT GENERATION - Generate initial content
        // =========================================================================
        reportProgress({
            phase: 'content',
            overallProgress: 20,
            currentSection: 0,
            totalSections: 0,
            message: 'Generating handbook content...',
            wordCount: 0,
            targetWordCount: targetWords,
        });

        // Build combined source content
        const combinedContent = sourcesWithContent
            .map(s => `📄 ${s.title}\n${s.content?.substring(0, 6000) || ''}`)
            .join('\n\n');

        // Build context from graph data
        let graphContext = '';
        if (graphData.entities.length > 0) {
            graphContext += `\n**Key Concepts:**\n${graphData.entities.slice(0, 30).map(e => `• ${e.name} (${e.type}): ${e.description}`).join('\n')}`;
        }
        if (graphData.relationships.length > 0) {
            graphContext += `\n\n**Key Relationships:**\n${graphData.relationships.slice(0, 20).map(r => `• ${r.source_node_name} → ${r.relation_type} → ${r.target_node_name}`).join('\n')}`;
        }

        const formatInstructions = getFormatInstructions(options.format);

        const initialPrompt = `You are an expert educator and technical writer creating a comprehensive ${options.format} handbook.

TOPIC: ${notebook.title}
TARGET LENGTH: ${options.length} (approximately ${targetWords} words)
${options.customPrompt ? `SPECIAL FOCUS: ${options.customPrompt}\n` : ''}
OUTLINE TO FOLLOW:
${outlineContent}

KNOWLEDGE GRAPH CONTEXT:
${graphContext}

SOURCE MATERIALS:
${combinedContent.substring(0, 20000)}

FORMAT REQUIREMENTS:
${formatInstructions}

CRITICAL INSTRUCTIONS:

1. **COMPREHENSIVE CONTENT**: Write detailed, informative content for EACH section. Do not leave placeholders or summaries.
   
2. **EDUCATIONAL DEPTH**: Include:
   - Clear explanations of concepts
   - Specific examples and illustrations
   - Data, facts, and evidence from sources
   - Step-by-step breakdowns where appropriate
   - Practical applications

3. **PROPER MARKDOWN FORMATTING**:
   - Use # for main title
   - Use ## for major sections
   - Use ### for subsections
   - Use #### for sub-subsections
   - Use **bold** for key terms
   - Use bullet points and numbered lists
   - Use tables for comparisons
   - Use > for important notes or quotes
   - Use --- for section breaks

4. **PRODUCTION QUALITY**: Write as if this will be published. Every section should be complete, accurate, and valuable.

5. **NATURAL FLOW**: Ensure smooth transitions between sections. The handbook should read as a cohesive document.

BEGIN GENERATING THE HANDBOOK NOW. Start with the title and continue through ALL sections in order.
Write at least ${Math.round(targetWords * 0.4)} words in this initial generation.`;

        const initialResponse = await chatProvider.chat.completions.create({
            model: CHAT_MODEL,
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert educator creating publication-quality educational materials. Write comprehensive, detailed content that provides genuine learning value. Never use placeholders or incomplete sections.',
                },
                { role: 'user', content: initialPrompt },
            ],
            temperature: 0.7,
            max_tokens: 8000,
        });

        let handbookContent = initialResponse.choices[0]?.message?.content || '';
        let currentWords = countWords(handbookContent);

        console.log(`✅ Initial content: ${currentWords} words`);

        // =========================================================================
        // PHASE 4: CONTINUATION - Generate additional content for longer handbooks
        // =========================================================================
        let continuationCount = 0;
        const targetThreshold = targetWords * 0.9; // 90% of target

        while (currentWords < targetThreshold && continuationCount < maxContinuations) {
            continuationCount++;
            const remainingWords = targetWords - currentWords;

            reportProgress({
                phase: 'continuation',
                overallProgress: 20 + Math.round((currentWords / targetWords) * 60),
                currentSection: continuationCount,
                totalSections: maxContinuations,
                message: `Expanding content (${continuationCount}/${maxContinuations})...`,
                wordCount: currentWords,
                targetWordCount: targetWords,
            });

            console.log(`📝 Continuation ${continuationCount}: ${currentWords}/${targetWords} words (need ${remainingWords} more)`);

            // Extract last portion for context
            const lastPortion = handbookContent.slice(-3000);

            // Find topics not yet covered in depth
            const continuationPrompt = `You are continuing to write a ${options.format} handbook.

CURRENT PROGRESS: ${currentWords} words written
TARGET: ${targetWords} words total
REMAINING: ${remainingWords} words needed

WHAT HAS BEEN WRITTEN SO FAR (last portion):
...${lastPortion}

ORIGINAL OUTLINE:
${outlineContent}

SOURCE MATERIALS (for additional content):
${combinedContent.substring(0, 12000)}

KNOWLEDGE GRAPH:
${graphContext}

INSTRUCTIONS:
1. Continue EXACTLY where the previous content left off
2. DO NOT repeat content already written
3. DO NOT add conclusion/ending phrases until we reach the target
4. Cover topics from the outline that haven't been fully addressed yet
5. Add MORE detail, examples, and depth to existing sections
6. Write at least ${Math.min(remainingWords, 3000)} more words
7. Maintain the same style, formatting, and quality

CONTINUE THE HANDBOOK NOW:`;

            const continuationResponse = await chatProvider.chat.completions.create({
                model: CHAT_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: 'You are continuing to write a comprehensive handbook. Pick up exactly where the previous content stopped. Add substantial, educational content. Do not repeat what was already written.',
                    },
                    { role: 'user', content: continuationPrompt },
                ],
                temperature: 0.7,
                max_tokens: 6000,
            });

            const continuation = continuationResponse.choices[0]?.message?.content || '';
            const continuationWords = countWords(continuation);

            if (continuationWords < 200) {
                console.warn('⚠️ Continuation too short, breaking loop');
                break;
            }

            // Clean continuation - remove repeated content
            const cleanedContinuation = cleanContinuation(handbookContent, continuation);
            handbookContent += '\n\n' + cleanedContinuation;
            currentWords = countWords(handbookContent);

            console.log(`✅ Added ${continuationWords} words (total: ${currentWords})`);
        }

        // =========================================================================
        // PHASE 5: FINALIZATION - Clean up and structure
        // =========================================================================
        reportProgress({
            phase: 'finalization',
            overallProgress: 85,
            currentSection: 0,
            totalSections: 0,
            message: 'Finalizing handbook...',
            wordCount: currentWords,
            targetWordCount: targetWords,
        });

        // Parse sections
        const sections = parseHandbookSections(handbookContent);
        const tableOfContents = generateTableOfContents(sections);
        const title = extractTitle(handbookContent) || `${options.format}: ${notebook.title}`;

        console.log(`✅ Finalized: ${sections.length} sections, ${currentWords} words`);

        // =========================================================================
        // PHASE 6: SAVE - Store in database
        // =========================================================================
        reportProgress({
            phase: 'saving',
            overallProgress: 90,
            currentSection: 0,
            totalSections: 0,
            message: 'Saving handbook...',
        });

        // Final cleanup of the entire content
        const cleanedContent = finalCleanupContent(handbookContent);
        const finalWordCount = countWords(cleanedContent);

        const handbook: GeneratedHandbook = {
            id: crypto.randomUUID(),
            notebookId,
            title,
            content: cleanedContent,
            format: options.format,
            length: options.length,
            sections,
            tableOfContents,
            metadata: {
                createdAt: new Date().toISOString(),
                wordCount: currentWords,
                pageEstimate: Math.ceil(currentWords / 500),
                model: 'gpt-5.4-mini',
                sourceCount: sourcesWithContent.length,
                customPrompt: options.customPrompt,
            },
        };

        await saveHandbook(handbook);

        reportProgress({
            phase: 'completed',
            overallProgress: 100,
            currentSection: sections.length,
            totalSections: sections.length,
            message: 'Handbook complete!',
            wordCount: currentWords,
            targetWordCount: targetWords,
        });

        console.log('\n' + '='.repeat(60));
        console.log('✅ HANDBOOK GENERATION COMPLETE');
        console.log(`   Title: ${title}`);
        console.log(`   Words: ${currentWords}`);
        console.log(`   Pages: ~${handbook.metadata.pageEstimate}`);
        console.log(`   Sections: ${sections.length}`);
        console.log('='.repeat(60) + '\n');

        return handbook;

    } catch (error) {
        console.error('❌ Handbook generation error:', error);
        throw error;
    }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function buildOutlinePrompt(
    title: string,
    format: HandbookFormat,
    length: HandbookLength,
    customPrompt: string | undefined,
    graphData: { entities: any[]; relationships: any[] },
    sources: any[]
): string {
    const topEntities = graphData.entities.slice(0, 20).map(e => e.name).join(', ');
    const sourcesList = sources.map(s => `- ${s.title}`).join('\n');

    return `Generate a detailed OUTLINE for a ${format} about "${title}".

LENGTH TARGET: ${length}
${customPrompt ? `SPECIAL FOCUS: ${customPrompt}` : ''}

KEY TOPICS TO COVER (from knowledge graph):
${topEntities || 'Use topics from source materials'}

SOURCE DOCUMENTS:
${sourcesList}

Create a hierarchical outline with:
- Main sections (use ## headings)
- Subsections (use ### headings)
- Key points for each section (use bullet points)

The outline should be comprehensive and logical.
Output ONLY the outline in markdown format.`;
}

function countWords(text: string): number {
    return text.split(/\s+/).filter(w => w.length > 0).length;
}

function cleanContinuation(existingContent: string, newContent: string): string {
    // Remove any accidental title repetitions
    const titleMatch = existingContent.match(/^#\s+(.+)$/m);
    if (titleMatch) {
        const title = titleMatch[1];
        newContent = newContent.replace(new RegExp(`^#\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'gm'), '');
    }

    // Remove conclusion/ending phrases that appear mid-document
    const prematureConclusions = [
        /In conclusion,?\s*/gi,
        /To summarize,?\s*/gi,
        /To wrap up,?\s*/gi,
        /In summary,?\s*/gi,
        /This concludes our.*/gi,
        /Thank you for reading.*/gi,
    ];

    // Remove AI meta-messages and generation artifacts
    const metaMessages = [
        // Generation progress messages
        /End of Initial Generation.*/gi,
        /Initial Generation Complete.*/gi,
        /≈\s*\d+[,.]?\d*\s*words?.*/gi,
        /The material above.*/gi,
        /The remaining chapters?.*/gi,
        /will be generated in subsequent.*/gi,
        /ensuring every section is fully fleshed out.*/gi,
        /to reach the full target.*/gi,
        /exceeds the.*word.*requirement.*/gi,
        /provides a complete.*foundation.*/gi,
        // Continuation markers
        /\[?Continuation\]?.*/gi,
        /\[?To be continued\]?.*/gi,
        /\[?More content follows\]?.*/gi,
        /\[?Next section\]?.*/gi,
        // AI self-references
        /As an AI.*/gi,
        /I will now.*/gi,
        /Let me continue.*/gi,
        /I'll proceed.*/gi,
        /Here's the continuation.*/gi,
        /Continuing from where.*/gi,
        /Picking up where.*/gi,
        // Word count references
        /\(\s*approximately\s*\d+.*words?\s*\)/gi,
        /\(\s*~?\s*\d+\s*words?\s*\)/gi,
        /word count:\s*\d+.*/gi,
        /current progress:\s*\d+.*/gi,
        /target:\s*\d+\s*words?.*/gi,
        // Meta comments about structure
        /\[Note:.*\]/gi,
        /\[Author's note:.*\]/gi,
        /\[Editor's note:.*\]/gi,
        /---\s*\n\s*\*\*Note\*\*:.*/gi,
    ];

    for (const pattern of prematureConclusions) {
        newContent = newContent.replace(pattern, '');
    }

    for (const pattern of metaMessages) {
        newContent = newContent.replace(pattern, '');
    }

    // Remove lines that are just dashes or equal signs (separators before meta content)
    newContent = newContent.replace(/^\s*[-=]{3,}\s*$/gm, '');

    // Clean up multiple consecutive empty lines
    newContent = newContent.replace(/\n{4,}/g, '\n\n\n');

    return newContent.trim();
}

/**
 * Final cleanup of the complete handbook content
 * Removes ALL meta-messages, AI artifacts, and generation markers
 */
function finalCleanupContent(content: string): string {
    let cleaned = content;

    // Comprehensive meta-message patterns for final cleanup
    const metaPatterns = [
        // Generation status messages
        /End of Initial Generation.*$/gim,
        /Initial Generation Complete.*$/gim,
        /≈\s*[\d,]+\s*words?.*$/gim,
        /\(\s*≈\s*[\d,]+\s*words?\s*\)/gi,
        /The material above.*$/gim,
        /The remaining chapters.*$/gim,
        /will be generated in subsequent.*$/gim,
        /ensuring every section is fully fleshed out.*$/gim,
        /to reach the full target.*$/gim,
        /exceeds the.*word.*requirement.*$/gim,
        /provides a complete.*foundation.*$/gim,
        /already exceeds.*minimum.*$/gim,
        /textbook-quality.*$/gim,
        // Word/page count meta
        /\d+[\-–]\s*word minimum.*$/gim,
        /\d+\+?\s*pages?.*target.*$/gim,
        /~?\s*\d+,?\d*\s*words?\s*so far.*$/gim,
        // AI/model references
        /As an AI.*$/gim,
        /I will now.*$/gim,
        /Let me continue.*$/gim,
        /I'll proceed.*$/gim,
        /Here's the continuation.*$/gim,
        /Continuing from where.*$/gim,
        /Picking up where.*$/gim,
        // Structural meta comments
        /\[Continuation\]/gi,
        /\[To be continued\]/gi,
        /\[More content follows\]/gi,
        /\[Next section\]/gi,
        /\[Note:.*?\]/gi,
        /\[Author's note:.*?\]/gi,
        /\[Editor's note:.*?\]/gi,
        // Progress references
        /word count:\s*\d+.*$/gim,
        /current progress:\s*\d+.*$/gim,
        /target:\s*\d+\s*words?.*$/gim,
        /Chapter \d+ will be.*$/gim,
    ];

    for (const pattern of metaPatterns) {
        cleaned = cleaned.replace(pattern, '');
    }

    // Remove separator lines that are just dashes or equals
    cleaned = cleaned.replace(/^\s*[-=]{3,}\s*$/gm, '');

    // Remove lines that are just "(approximately X words)" or similar
    cleaned = cleaned.replace(/^\s*\(.*\d+.*words?.*\)\s*$/gim, '');

    // Clean up excessive whitespace
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
    cleaned = cleaned.replace(/^\s+$/gm, '');

    return cleaned.trim();
}

function parseHandbookSections(content: string): HandbookSection[] {
    const sections: HandbookSection[] = [];
    const lines = content.split('\n');

    let currentSection: HandbookSection | null = null;
    let currentContent: string[] = [];

    for (const line of lines) {
        const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

        if (headerMatch) {
            // Save previous section
            if (currentSection) {
                currentSection.content = currentContent.join('\n').trim();
                sections.push(currentSection);
            }

            currentSection = {
                id: crypto.randomUUID(),
                title: headerMatch[2].trim(),
                content: '',
                level: headerMatch[1].length,
            };
            currentContent = [];
        } else if (currentSection) {
            currentContent.push(line);
        }
    }

    // Save last section
    if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
        sections.push(currentSection);
    }

    return sections;
}

function generateTableOfContents(sections: HandbookSection[]): HandbookTOCEntry[] {
    return sections.map(section => ({
        id: section.id,
        title: section.title,
        level: section.level,
    }));
}

function extractTitle(content: string): string | null {
    const match = content.match(/^#\s+(.+)$/m);
    if (!match) return null;

    let title = match[1].trim();

    // Remove markdown formatting from title
    title = title.replace(/\*\*(.+?)\*\*/g, '$1'); // Bold **text**
    title = title.replace(/\*(.+?)\*/g, '$1');     // Italic *text*
    title = title.replace(/__(.+?)__/g, '$1');     // Bold __text__
    title = title.replace(/_(.+?)_/g, '$1');       // Italic _text_
    title = title.replace(/`(.+?)`/g, '$1');       // Code `text`
    title = title.replace(/\[(.+?)\]\(.+?\)/g, '$1'); // Links [text](url)
    title = title.replace(/~~(.+?)~~/g, '$1');     // Strikethrough

    return title.trim();
}

// =============================================================================
// DATABASE OPERATIONS
// =============================================================================

export async function saveHandbook(handbook: GeneratedHandbook): Promise<void> {
    console.log('💾 Saving handbook to database...');

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw userError || new Error('Authentication required.');

    const { data: saved, error } = await supabase
        .from('handbooks')
        .insert({
            id: handbook.id,
            notebook_id: handbook.notebookId,
            user_id: user.id,
            title: handbook.title,
            format: handbook.format,
            length: handbook.length,
            word_count: handbook.metadata.wordCount,
            source_count: handbook.metadata.sourceCount,
            custom_prompt: handbook.metadata.customPrompt,
            model: handbook.metadata.model,
            created_at: handbook.metadata.createdAt,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error saving handbook:', error);
        throw error;
    }

    const { error: sectionsError } = await supabase
        .from('handbook_sections')
        .insert(handbook.sections.map((section, index) => ({
            id: section.id,
            handbook_id: saved?.id,
            level: section.level,
            title: section.title,
            content_markdown: section.content,
            order_index: index,
        })));

    if (sectionsError) {
        console.error('Error saving handbook sections:', sectionsError);
        throw sectionsError;
    }

    console.log('✅ Handbook saved successfully');
}

export async function loadHandbooks(notebookId: string): Promise<GeneratedHandbook[]> {
    const { data, error } = await supabase
        .from('generated_assets')
        .select('*')
        .eq('notebook_id', notebookId)
        .eq('type', 'handbook')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading handbooks:', error);
        throw error;
    }

    return (data || []).map(item => item.metadata.handbookData as GeneratedHandbook);
}

export async function deleteHandbook(handbookId: string): Promise<void> {
    const { error } = await supabase
        .from('generated_assets')
        .delete()
        .eq('id', handbookId);

    if (error) {
        console.error('Error deleting handbook:', error);
        throw error;
    }

    console.log('✅ Handbook deleted successfully');
}
