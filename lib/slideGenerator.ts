import { createServerOnlyProviderClient } from './serverOnlyProvider';
import { supabase } from './supabase/client';
import { retrieveGraphForTopic, getAllGraphData } from './lightragRetrieval';

// AI provider calls must be routed through server-side infrastructure.
const chatProvider = createServerOnlyProviderClient('chat');

const openai = createServerOnlyProviderClient('image');

// ============================================================================
// SLIDE TYPES & INTERFACES
// ============================================================================

export type SlideType =
  | 'title'           // Opening slide with main topic
  | 'section'         // Section header slide
  | 'content'         // Standard content with bullet points
  | 'comparison'      // Side-by-side comparison (like the RAG vs Standard AI example)
  | 'diagram'         // Visual diagram or flowchart
  | 'quote'           // Key quote or highlight
  | 'summary'         // Closing summary slide
  | 'stats';          // Statistics or key numbers

export type SlideStyle =
  | 'minimalist'      // Clean, simple design
  | 'illustrated'     // Hand-drawn style icons (like NotebookLM)
  | 'technical'       // Blueprint/technical drawing style
  | 'corporate';      // Professional business style

export interface SlideElement {
  id: string;
  type: 'text' | 'icon' | 'image' | 'chart' | 'arrow' | 'box';
  content: string;
  position?: { x: number; y: number };
  style?: Record<string, string>;
}

export interface Slide {
  id: string;
  type: SlideType;
  title: string;
  subtitle?: string;
  bullets?: string[];
  elements?: SlideElement[];
  formula?: string;        // LaTeX formula for KaTeX rendering
  mermaidCode?: string;    // Mermaid diagram code for diagram-type slides
  imagePrompt?: string;    // Image generation prompt
  imageBase64?: string;    // Generated image
  imageUrl?: string;       // Generated image URL
  narration: string;       // Text to be spoken during this slide
  durationMs: number;      // How long to show this slide
  notes?: string;          // Speaker notes
}

export interface SlideScript {
  slides: Slide[];
  totalDuration: number;
  metadata: {
    style: SlideStyle;
    topic: string;
    slideCount: number;
    generatedAt: string;
  };
}

export interface VideoOverviewOptions {
  format: 'deep-dive' | 'summary' | 'debate' | 'analysis';
  duration: '5min' | '10min' | '20min';
  style: SlideStyle;
  customPrompt?: string;
  graphMode?: 'broad' | 'focused' | 'exploratory';
}

// Duration to slide count mapping
const DURATION_TO_SLIDES: Record<string, number> = {
  '5min': 8,
  '10min': 15,
  '20min': 30,
};

// Duration to word count for narration (approx 150 words per minute)
const DURATION_TO_WORDS: Record<string, number> = {
  '5min': 750,
  '10min': 1500,
  '20min': 3000,
};

// ============================================================================
// SLIDE SCRIPT GENERATION
// ============================================================================

/**
 * Generate slide script from notebook sources
 */
export async function generateSlideScript(
  notebookId: string,
  options: VideoOverviewOptions
): Promise<SlideScript> {
  console.log('🎬 Generating slide script...');
  console.log('   Notebook ID:', notebookId);
  console.log('   Format:', options.format);
  console.log('   Duration:', options.duration);
  console.log('   Style:', options.style);

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

  // Retrieve knowledge graph data
  const graphMode = options.graphMode || 'broad';
  let graphData: { entities: any[]; relationships: any[] };

  if (graphMode === 'broad') {
    graphData = await getAllGraphData(notebookId, 30);
  } else {
    const topic = options.customPrompt || sourcesWithContent.map(s => s.title).join(', ');
    graphData = await retrieveGraphForTopic(topic, notebookId, {
      entityCount: 15,
      relationshipCount: 10
    });
  }

  console.log(`   ✓ Graph: ${graphData.entities.length} entities, ${graphData.relationships.length} relationships`);

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

  const targetSlides = DURATION_TO_SLIDES[options.duration] || 15;
  const targetWords = DURATION_TO_WORDS[options.duration] || 1500;
  const wordsPerSlide = Math.floor(targetWords / targetSlides);

  // Style-specific instructions
  const styleInstructions: Record<SlideStyle, string> = {
    minimalist: 'Clean, simple visuals with minimal elements. Use whitespace effectively. Icons should be simple line drawings.',
    illustrated: 'Hand-drawn style illustrations like NotebookLM. Warm yellow/cream backgrounds with playful icons. Think whiteboard sketches.',
    technical: 'Blueprint-style diagrams with precise lines. Technical drawing aesthetic. Use grids and measurement-like annotations.',
    corporate: 'Professional business style with clean gradients. Modern corporate design with subtle shadows.',
  };

  // Format-specific prompts
  const formatPrompts: Record<string, string> = {
    'deep-dive': 'Create an in-depth educational presentation that thoroughly explains the topic with detailed explanations and examples.',
    'summary': 'Create a quick recap presentation hitting the key points concisely. Focus on highlights and takeaways.',
    'debate': 'Create a presentation that explores multiple perspectives and contrasting viewpoints on the topic.',
    'analysis': 'Create an analytical presentation that systematically breaks down the topic into components and examines each.',
  };

  const prompt = `You are creating a video presentation script with synchronized slides and narration.

${formatPrompts[options.format]}

**REQUIREMENTS:**
- Generate exactly ${targetSlides} slides
- Total narration should be approximately ${targetWords} words (~${wordsPerSlide} words per slide)
- Style: ${options.style} - ${styleInstructions[options.style]}
${options.customPrompt ? `\n**Special focus:** ${options.customPrompt}\n` : ''}

${entitiesContext}

${relationshipsContext}

**CONTENT:**
${combinedContent.substring(0, 10000)}

**OUTPUT FORMAT:**
Return a JSON array of slides. Each slide must have:
{
  "type": "title|section|content|comparison|diagram|quote|summary|stats",
  "title": "Slide Title",
  "subtitle": "Optional subtitle",
  "bullets": ["Point 1", "Point 2", "Point 3"],
  "formula": "LaTeX formula if applicable, e.g., E = mc^2 or \\\\frac{\\\\partial L}{\\\\partial w}",
  "mermaidCode": "For 'diagram' type slides ONLY: Mermaid.js diagram code (flowchart, sequence, etc). Example: 'graph TD; A[Start] --> B[Process]; B --> C[End]'",
  "imagePrompt": "Detailed prompt that DIRECTLY VISUALIZES the concept (see IMAGE PROMPT GUIDELINES below). NO TEXT IN IMAGES. OMIT for diagram slides that use mermaidCode.",
  "narration": "What the speaker says during this slide. Natural, conversational, educational tone. About ${wordsPerSlide} words.",
  "notes": "Additional context or speaker notes"
}

**SLIDE TYPE GUIDELINES:**
- "title": Opening slide. Has main title and subtitle. Brief intro narration.
- "section": New section header. Short narration transitioning to new topic.
- "content": Standard slide with 3-5 bullet points and detailed narration.
- "comparison": Two-column comparison (like Standard AI vs RAG AI). Include both perspectives in narration.
- "diagram": Visual flow or process diagram. USE mermaidCode for flowcharts, sequences, or architecture diagrams. Narration explains the steps/flow.
- "quote": Key insight or important quote. Narration expands on its significance.
- "summary": Closing slide with key takeaways. Wrapping up narration.
- "stats": Key statistics or numbers. Narration contextualizes the data.

**IMAGE PROMPT GUIDELINES - CRITICAL:**
Create image prompts that DIRECTLY VISUALIZE the concept, not generic icons. Examples:

For PROCESSES (e.g., diffusion, training):
- "A horizontal sequence of 4 frames showing [process]: leftmost shows [start state], gradually transforming through middle frames, rightmost shows [end state]. Arrows between each frame."

For FORMULAS/MATH:
- Describe the visual representation: "A graph showing the relationship between [variables]" or "Geometric visualization of [formula concept]"

For COMPARISONS:
- "Split screen: left side shows [concept A] with [visual elements], right side shows [concept B] with contrasting elements. VS symbol in center."

For ARCHITECTURE/DIAGRAMS:
- "A layered diagram showing [architecture]: [describe each layer and connections]"

SPECIFIC EXAMPLES:
- Forward diffusion: "4 frames sequence: clear image on left → progressively noisy → pure noise on right, arrows between frames"
- Neural network: "Node diagram with input layer (3 nodes), hidden layers (5,4 nodes), output layer (2 nodes), connecting lines showing weights"
- Attention: "Query/Key/Value vectors as colored columns, attention matrix as heatmap, arrows showing the flow"
- Gradient descent: "3D loss surface with a ball rolling down the slope, dotted path showing descent"

Style: ${options.style} - Hand-drawn NotebookLM aesthetic, warm cream background, NO TEXT in images

Return a JSON object with a "slides" key containing the array: { "slides": [...] }`;

  console.log('📝 Generating slides with OpenAI GPT-4o...');

  // Use OpenAI GPT-4o for reliable slide generation (Nemotron often fails to produce valid JSON)
  if (!openai) {
    throw new Error('Slide generation provider is not configured on the server.');
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are an expert educational content creator specializing in visual presentations. You create engaging slides with clear narration. ALWAYS respond with a valid JSON object containing a "slides" key with an array of slide objects.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '{}';

  // Parse JSON from response (GPT-4o returns JSON object with response_format)
  let slidesData: any[];
  try {
    const parsed = JSON.parse(content);
    // Handle both { slides: [...] } and direct array format
    if (Array.isArray(parsed)) {
      slidesData = parsed;
    } else if (parsed.slides && Array.isArray(parsed.slides)) {
      slidesData = parsed.slides;
    } else {
      // Try to find an array in the parsed object
      const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
      if (arrayKey) {
        slidesData = parsed[arrayKey];
      } else {
        throw new Error('No slides array found in response');
      }
    }
    console.log(`📊 Parsed ${slidesData.length} slides from GPT-4o response`);
  } catch (parseError) {
    console.error('❌ Failed to parse slides JSON:', parseError);
    console.log('Raw response:', content);
    throw new Error('Failed to parse slide generation response');
  }

  // Convert to Slide objects with IDs and durations
  const slides: Slide[] = slidesData.map((s: any, index: number) => {
    // Calculate duration based on narration length (approx 150 words per minute)
    const wordCount = (s.narration || '').split(/\s+/).length;
    const durationMs = Math.max(5000, Math.round((wordCount / 150) * 60 * 1000));

    return {
      id: crypto.randomUUID(),
      type: s.type || 'content',
      title: s.title || `Slide ${index + 1}`,
      subtitle: s.subtitle,
      bullets: s.bullets || [],
      formula: s.formula,
      mermaidCode: s.mermaidCode,
      imagePrompt: s.imagePrompt,
      narration: s.narration || '',
      durationMs,
      notes: s.notes,
    };
  });

  const totalDuration = slides.reduce((sum, s) => sum + s.durationMs, 0);

  console.log(`✅ Generated ${slides.length} slides (${Math.round(totalDuration / 1000)}s total)`);

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
// SLIDE IMAGE GENERATION
// ============================================================================

/**
 * Generate illustration for a single slide using the server-side image provider.
 */
export async function generateSlideImage(
  slide: Slide,
  style: SlideStyle
): Promise<string> {
  // Skip if no image prompt or if slide has Mermaid diagram
  if (!slide.imagePrompt || slide.mermaidCode) {
    return '';
  }

  if (!openai) {
    console.error('❌ OpenAI API not configured - cannot generate images');
    return '';
  }

  const styleEnhancements: Record<SlideStyle, string> = {
    minimalist: 'Minimalist design, simple flat icons, clean lines, lots of white space, subtle shadows, modern vector style, white background',
    illustrated: 'Hand-drawn illustration style, warm cream/yellow background like #FEF9E7, playful sketchy icons, educational whiteboard aesthetic, soft watercolor textures, pencil and marker strokes, rounded shapes, friendly educational feel, like Google NotebookLM visual style',
    technical: 'Technical blueprint style, precise geometric lines, grid background, measurement annotations, engineering diagram aesthetic, blue and white color scheme',
    corporate: 'Professional corporate design, clean gradients, subtle 3D depth, modern business infographic style, blue and gray color palette',
  };

  const prompt = `${slide.imagePrompt}

Style: ${styleEnhancements[style]}

IMPORTANT:
- NO text, labels, or words of any kind
- Clean, educational illustration suitable for a presentation slide
- High contrast for visibility
- 16:9 aspect ratio composition
- Focus on visual metaphors and icons`;

  console.log(`🎨 Generating image for slide: "${slide.title}"`);
  console.log(`   OpenAI client available:`, !!openai);

  try {
    // Use OpenAI gpt-image-1 model with LOW quality for cost effectiveness
    console.log('   Calling OpenAI images.generate (low quality for cost savings)...');
    const response = await openai.images.generate({
      model: 'gpt-image-1',
      prompt: prompt,
      n: 1,
      size: '1024x1024', // Smaller size for lower cost
      quality: 'low',    // Low quality for cost effectiveness
    } as any);

    console.log('   Response received, data count:', response.data?.length || 0);

    if (response.data && response.data.length > 0) {
      const imageData = response.data[0];
      console.log('   Image data properties:', Object.keys(imageData || {}).join(', '));

      // gpt-image-1 returns b64_json by default
      if (imageData.b64_json) {
        console.log(`✅ GPT Image generated for: "${slide.title}" (base64 length: ${imageData.b64_json.length})`);
        return `data:image/png;base64,${imageData.b64_json}`;
      }

      // Fallback: if URL is returned, fetch and convert to base64
      if (imageData.url) {
        try {
          const imgResponse = await fetch(imageData.url);
          if (!imgResponse.ok) {
            console.warn(`⚠️ Failed to fetch image from URL: ${imgResponse.status}`);
            return imageData.url; // Return URL as fallback
          }

          const blob = await imgResponse.blob();
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

          console.log(`✅ GPT Image generated for: "${slide.title}"`);
          return base64;
        } catch (fetchError) {
          console.warn(`⚠️ Failed to convert image to base64:`, fetchError);
          return imageData.url;
        }
      }
    }

    console.error(`❌ No image data in response for slide "${slide.title}"`);
    return '';
  } catch (error: any) {
    console.error(`❌ GPT Image generation failed for slide "${slide.title}":`, error?.message || error);

    // Try DALL-E 3 as fallback if gpt-image-1 fails
    try {
      console.log(`   Trying DALL-E 3 as fallback...`);
      const fallbackResponse = await openai.images.generate({
        model: 'dall-e-3',
        prompt: prompt,
        n: 1,
        size: '1792x1024', // 16:9 for DALL-E 3
        quality: 'standard',
        response_format: 'b64_json',
      });

      if (fallbackResponse.data && fallbackResponse.data.length > 0 && fallbackResponse.data[0].b64_json) {
        console.log(`✅ DALL-E 3 fallback image generated for: "${slide.title}"`);
        return `data:image/png;base64,${fallbackResponse.data[0].b64_json}`;
      }
    } catch (fallbackError: any) {
      console.error(`❌ DALL-E 3 fallback also failed:`, fallbackError?.message || fallbackError);
    }

    return '';
  }
}

/**
 * Generate images for all slides in parallel batches
 */
export async function generateAllSlideImages(
  slides: Slide[],
  style: SlideStyle,
  onProgress?: (current: number, total: number) => void
): Promise<Slide[]> {
  const slidesWithPrompts = slides.filter(s => s.imagePrompt);
  const total = slidesWithPrompts.length;
  let completed = 0;

  console.log(`🖼️ Generating ${total} slide images...`);

  // Process in batches of 3 to avoid rate limits
  const batchSize = 3;
  const updatedSlides = [...slides];

  for (let i = 0; i < slidesWithPrompts.length; i += batchSize) {
    const batch = slidesWithPrompts.slice(i, i + batchSize);

    const results = await Promise.all(
      batch.map(async (slide) => {
        const imageBase64 = await generateSlideImage(slide, style);
        completed++;
        onProgress?.(completed, total);
        return { slideId: slide.id, imageBase64 };
      })
    );

    // Update slides with generated images
    for (const result of results) {
      const slideIndex = updatedSlides.findIndex(s => s.id === result.slideId);
      if (slideIndex !== -1) {
        updatedSlides[slideIndex] = {
          ...updatedSlides[slideIndex],
          imageBase64: result.imageBase64,
        };
      }
    }
  }

  console.log(`✅ Generated ${completed} slide images`);
  return updatedSlides;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate total narration word count
 */
export function getTotalWordCount(slides: Slide[]): number {
  return slides.reduce((sum, slide) => {
    return sum + (slide.narration || '').split(/\s+/).length;
  }, 0);
}

/**
 * Format slide duration to MM:SS
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

/**
 * Get cumulative timestamps for each slide
 */
export function getSlideTimestamps(slides: Slide[]): { slideId: string; startMs: number; endMs: number }[] {
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
