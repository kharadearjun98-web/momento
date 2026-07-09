/**
 * Visual Slide Generator
 * Creates NotebookLM-style educational slides with FLUX-generated visuals,
 * KaTeX math formulas, and synchronized narration
 */

import { createServerOnlyProviderClient } from './serverOnlyProvider';
import { supabase } from './supabase/client';
import { retrieveGraphForTopic, getAllGraphData } from './lightragRetrieval';
import {
    generateFluxImage,
    generateConceptVisual,
    generateComparisonVisual,
    generateFlowVisual,
    generateTitleVisual,
    generateSummaryVisual,
    FluxImageOptions,
} from './fluxImageGenerator';

// AI provider calls must be routed through server-side infrastructure.
const chatProvider = createServerOnlyProviderClient('chat');

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type VisualSlideType =
    | 'title'           // Opening slide with main topic
    | 'concept'         // Explain a concept with visual metaphors
    | 'comparison'      // Side-by-side comparison
    | 'flow'            // Process or workflow diagram
    | 'formula'         // Mathematical formula with visualization
    | 'summary';        // Key takeaways

export type VisualStyle = 'illustrated' | 'minimalist' | 'technical';

export interface VisualSlide {
    id: string;
    type: VisualSlideType;
    title: string;
    subtitle?: string;
    content: string;           // Main text content (supports markdown + KaTeX)
    bullets?: string[];        // Optional bullet points
    formula?: string;          // LaTeX formula if applicable
    visualElements: string[];  // Visual elements to include (brain, book, etc.)
    imageBase64?: string;      // Generated FLUX image
    narration: string;         // Text for TTS
    durationMs: number;        // Slide display duration
    notes?: string;            // Speaker notes
}

export interface VisualSlideScript {
    slides: VisualSlide[];
    totalDuration: number;
    metadata: {
        style: VisualStyle;
        topic: string;
        slideCount: number;
        generatedAt: string;
    };
}

export interface VisualOverviewOptions {
    format: 'deep-dive' | 'summary' | 'tutorial' | 'review';
    duration: '5min' | '10min' | '15min';
    style: VisualStyle;
    customPrompt?: string;
    includeFormulas?: boolean;
    graphMode?: 'broad' | 'focused';
}

// Duration mappings
const DURATION_TO_SLIDES: Record<string, number> = {
    '5min': 8,
    '10min': 14,
    '15min': 20,
};

const DURATION_TO_WORDS: Record<string, number> = {
    '5min': 750,
    '10min': 1500,
    '15min': 2250,
};

// ============================================================================
// VISUAL SLIDE SCRIPT GENERATION
// ============================================================================

/**
 * Generate a visual slide script from notebook sources
 */
export async function generateVisualSlideScript(
    notebookId: string,
    options: VisualOverviewOptions,
    onProgress?: (status: string) => void
): Promise<VisualSlideScript> {
    console.log('🎬 Generating visual slide script...');
    onProgress?.('Fetching notebook sources...');

    // Fetch all sources for the notebook
    const { data: sources, error: sourcesError } = await supabase
        .from('sources')
        .select('title, content, type, processing_status')
        .eq('notebook_id', notebookId);

    if (sourcesError) {
        console.error('❌ Supabase error:', sourcesError);
        throw sourcesError;
    }

    if (!sources || sources.length === 0) {
        throw new Error('No sources found for this notebook. Please upload some documents first.');
    }

    const sourcesWithContent = sources.filter(s => s.content && s.content.trim().length > 0);

    if (sourcesWithContent.length === 0) {
        throw new Error('Sources found but none have been processed yet. Try uploading again.');
    }

    console.log(`✅ Using ${sourcesWithContent.length} sources with content`);
    onProgress?.('Building knowledge graph context...');

    // Retrieve knowledge graph data
    const graphMode = options.graphMode || 'broad';
    let graphData: { entities: any[]; relationships: any[] };

    if (graphMode === 'broad') {
        graphData = await getAllGraphData(notebookId, 25);
    } else {
        const topic = options.customPrompt || sourcesWithContent.map(s => s.title).join(', ');
        graphData = await retrieveGraphForTopic(topic, notebookId, {
            entityCount: 15,
            relationshipCount: 10
        });
    }

    console.log(`   ✓ Graph: ${graphData.entities.length} entities, ${graphData.relationships.length} relationships`);
    onProgress?.('Generating slide script with AI...');

    // Combine source content
    const combinedContent = sourcesWithContent
        .map(s => `📄 ${s.title}\n${s.content?.substring(0, 3000) || ''}`)
        .join('\n\n');

    // Format entities and relationships for context
    const entitiesContext = graphData.entities.length > 0
        ? `**Key Entities:**\n${graphData.entities.map(e => `• ${e.name} (${e.type}): ${e.description}`).join('\n')}`
        : '';

    const relationshipsContext = graphData.relationships.length > 0
        ? `**Key Relationships:**\n${graphData.relationships.map(r => `• ${r.source_node_name} → ${r.relation_type} → ${r.target_node_name}`).join('\n')}`
        : '';

    const targetSlides = DURATION_TO_SLIDES[options.duration] || 10;
    const targetWords = DURATION_TO_WORDS[options.duration] || 1000;
    const wordsPerSlide = Math.floor(targetWords / targetSlides);

    // Format-specific prompts
    const formatPrompts: Record<string, string> = {
        'deep-dive': 'Create an in-depth educational presentation that thoroughly explains the topic with detailed visual metaphors.',
        'summary': 'Create a quick recap presentation with key visual highlights. Focus on the most important concepts.',
        'tutorial': 'Create a step-by-step tutorial presentation with clear visual guides for each step.',
        'review': 'Create a review presentation that tests understanding with visual quizzes and concept checks.',
    };

    const prompt = `You are creating a VISUAL educational presentation script for learners. Each slide should have:
1. A clear concept to visualize
2. Visual elements (icons/metaphors) that represent the idea
3. Natural narration explaining the concept
${options.includeFormulas ? '4. Mathematical formulas in LaTeX format where applicable' : ''}

${formatPrompts[options.format]}

**REQUIREMENTS:**
- Generate exactly ${targetSlides} slides
- Total narration: ~${targetWords} words (~${wordsPerSlide} words per slide)
- Style: ${options.style}
${options.customPrompt ? `\n**Special focus:** ${options.customPrompt}\n` : ''}

${entitiesContext}

${relationshipsContext}

**CONTENT:**
${combinedContent.substring(0, 8000)}

**OUTPUT FORMAT:**
Return a JSON object with a "slides" array. Each slide must have:
{
  "type": "title|concept|comparison|flow|formula|summary",
  "title": "Slide Title",
  "subtitle": "Optional subtitle",
  "content": "Main content text with **bold** and *italic* for emphasis",
  "bullets": ["Point 1", "Point 2"],
  "formula": "LaTeX formula if type is formula, e.g., E = mc^2",
  "visualElements": ["brain", "gears", "book", "lightbulb", "arrows", "network", "database"],
  "narration": "Natural speech explaining this slide. About ${wordsPerSlide} words.",
  "notes": "Additional context"
}

**VISUAL ELEMENT OPTIONS:**
brain, book, lightbulb, gears, magnifier, database, globe, chart, puzzle, rocket, target, network, calendar, checklist, hourglass, key, shield, arrows

**SLIDE TYPE GUIDELINES:**
- "title": Opening slide with topic introduction
- "concept": Explain a concept using visual metaphors (brain for thinking, gears for process)
- "comparison": Two contrasting ideas side by side
- "flow": Step-by-step process with connected stages
- "formula": Mathematical concept with LaTeX equation
- "summary": Key takeaways with achievement icons

Return JSON: { "slides": [...] }`;

    // Generate script using Grok 4.1 Fast
    const response = await chatProvider.chat.completions.create({
        model: 'gpt-5.4-mini',
        messages: [
            {
                role: 'system',
                content: 'You are an expert educational content creator. Create visual slide scripts that help learners understand concepts through visual metaphors and clear explanations. ALWAYS respond with valid JSON.'
            },
            { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 6000,
    });

    const content = response.choices[0]?.message?.content || '{}';

    // Parse JSON from response
    let slidesData: any[];
    try {
        // Extract JSON from potential markdown code blocks
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
        const jsonStr = jsonMatch[1] || content;
        const parsed = JSON.parse(jsonStr.trim());

        if (Array.isArray(parsed)) {
            slidesData = parsed;
        } else if (parsed.slides && Array.isArray(parsed.slides)) {
            slidesData = parsed.slides;
        } else {
            const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
            if (arrayKey) {
                slidesData = parsed[arrayKey];
            } else {
                throw new Error('No slides array found in response');
            }
        }
        console.log(`📊 Parsed ${slidesData.length} slides from AI response`);
    } catch (parseError) {
        console.error('❌ Failed to parse slides JSON:', parseError);
        console.log('Raw response:', content);
        throw new Error('Failed to parse slide generation response. Please try again.');
    }

    onProgress?.('Generating visuals for slides...');

    // Convert to VisualSlide objects with IDs and durations
    const slides: VisualSlide[] = slidesData.map((s: any, index: number) => {
        const wordCount = (s.narration || '').split(/\s+/).length;
        const durationMs = Math.max(5000, Math.round((wordCount / 150) * 60 * 1000));

        return {
            id: crypto.randomUUID(),
            type: s.type || 'concept',
            title: s.title || `Slide ${index + 1}`,
            subtitle: s.subtitle,
            content: s.content || '',
            bullets: s.bullets || [],
            formula: s.formula,
            visualElements: s.visualElements || ['brain', 'book'],
            narration: s.narration || '',
            durationMs,
            notes: s.notes,
        };
    });

    // Generate FLUX images for each slide
    await generateSlideImages(slides, options.style, onProgress);

    const totalDuration = slides.reduce((sum, s) => sum + s.durationMs, 0);

    console.log(`✅ Generated ${slides.length} visual slides (${Math.round(totalDuration / 1000)}s total)`);

    return {
        slides,
        totalDuration,
        metadata: {
            style: options.style,
            topic: sourcesWithContent[0]?.title || 'Untitled',
            slideCount: slides.length,
            generatedAt: new Date().toISOString(),
        },
    };
}

// ============================================================================
// IMAGE GENERATION FOR SLIDES
// ============================================================================

/**
 * Generate FLUX images for all slides
 */
async function generateSlideImages(
    slides: VisualSlide[],
    style: VisualStyle,
    onProgress?: (status: string) => void
): Promise<void> {
    console.log(`🖼️ Generating ${slides.length} slide images...`);

    for (let i = 0; i < slides.length; i++) {
        const slide = slides[i];
        onProgress?.(`Generating visual ${i + 1}/${slides.length}: ${slide.title}`);

        try {
            let visual;

            switch (slide.type) {
                case 'title':
                    visual = await generateTitleVisual(slide.title, slide.subtitle || '', style);
                    break;

                case 'comparison':
                    if (slide.bullets && slide.bullets.length >= 2) {
                        visual = await generateComparisonVisual(slide.bullets[0], slide.bullets[1], style);
                    } else {
                        visual = await generateConceptVisual(slide.title, slide.visualElements, style);
                    }
                    break;

                case 'flow':
                    visual = await generateFlowVisual(slide.bullets || [], slide.title, style);
                    break;

                case 'summary':
                    visual = await generateSummaryVisual(slide.bullets || [], style);
                    break;

                case 'concept':
                case 'formula':
                default:
                    visual = await generateConceptVisual(slide.title, slide.visualElements, style);
                    break;
            }

            slide.imageBase64 = visual.imageBase64;
        } catch (error) {
            console.warn(`⚠️ Failed to generate image for slide ${i + 1}:`, error);
            // Continue without image - slide will render with SVG fallback
        }

        // Small delay between requests to avoid rate limiting
        if (i < slides.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log(`✅ Generated images for ${slides.length} slides`);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get slide timestamps for audio synchronization
 */
export function getVisualSlideTimestamps(slides: VisualSlide[]): { slideId: string; startMs: number; endMs: number }[] {
    let currentTime = 0;
    return slides.map(slide => {
        const timestamp = {
            slideId: slide.id,
            startMs: currentTime,
            endMs: currentTime + slide.durationMs,
        };
        currentTime += slide.durationMs;
        return timestamp;
    });
}

/**
 * Format duration in MM:SS
 */
export function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Calculate total word count from narrations
 */
export function getTotalNarrationWords(slides: VisualSlide[]): number {
    return slides.reduce((sum, slide) => {
        return sum + (slide.narration || '').split(/\s+/).length;
    }, 0);
}
