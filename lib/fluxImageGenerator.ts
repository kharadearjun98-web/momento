import { supabase } from './supabase/client';

export interface FluxImageOptions {
  style: 'illustrated' | 'minimalist' | 'technical';
  width?: number;
  height?: number;
  numInferenceSteps?: number;
}

export interface GeneratedVisual {
  imageUrl: string;
  imageBase64?: string;
  prompt: string;
  style: string;
}

const STYLE_PROMPTS: Record<string, string> = {
  illustrated: `Hand-drawn illustration style, warm cream/yellow background like #FEF9E7,
playful sketchy icons, educational whiteboard aesthetic, soft watercolor textures,
pencil and marker strokes, rounded shapes, friendly educational feel,
like Google NotebookLM visual style, NO TEXT or labels in the image`,
  minimalist: `Clean minimalist design, white background, simple flat vector icons,
subtle shadows, modern professional style, lots of whitespace,
geometric shapes, monochromatic with accent colors, NO TEXT or labels`,
  technical: `Technical blueprint style, dark navy background #0a192f,
precise geometric lines, grid pattern overlay, cyan accent color #64ffda,
engineering diagram aesthetic, circuit-like connections, NO TEXT or labels`,
};

const VISUAL_ELEMENTS: Record<string, string> = {
  brain: 'human brain illustration with neural connections',
  book: 'open book with pages fanning out',
  lightbulb: 'glowing lightbulb representing ideas',
  gears: 'interlocking mechanical gears',
  magnifier: 'magnifying glass searching',
  database: 'stacked cylindrical database servers',
  globe: 'earth globe with connection points',
  chart: 'rising bar chart or line graph',
  puzzle: 'interlocking puzzle pieces',
  rocket: 'launching rocket representing growth',
  target: 'bullseye target with arrow',
  network: 'interconnected nodes forming network',
  calendar: 'calendar with marked dates',
  checklist: 'checklist with checkmarks',
  hourglass: 'hourglass showing time',
  key: 'golden key unlocking concept',
  shield: 'protective shield',
  arrows: 'directional arrows showing flow',
};

export async function generateFluxImage(
  prompt: string,
  options: FluxImageOptions = { style: 'illustrated' },
): Promise<GeneratedVisual> {
  const stylePrompt = STYLE_PROMPTS[options.style] || STYLE_PROMPTS.illustrated;
  const enhancedPrompt = `${prompt}. ${stylePrompt}`;

  try {
    const { data, error } = await supabase.functions.invoke('image', {
      body: {
        prompt: enhancedPrompt,
        width: options.width || 1344,
        height: options.height || 768,
        numInferenceSteps: options.numInferenceSteps || 4,
        provider: 'fal-flux-schnell',
      },
    });

    if (error) {
      throw new Error(`Image function failed: ${error.message}`);
    }

    if (!data?.imageUrl) {
      throw new Error('No image returned from image function');
    }

    return {
      imageUrl: data.imageUrl,
      imageBase64: data.imageBase64,
      prompt,
      style: options.style,
    };
  } catch (error) {
    console.error('FLUX generation failed:', error);
    return generatePlaceholder(prompt, options.style);
  }
}

export async function generateConceptVisual(
  concept: string,
  elements: string[],
  style: 'illustrated' | 'minimalist' | 'technical' = 'illustrated',
): Promise<GeneratedVisual> {
  const visualDescriptions = elements
    .map((el) => VISUAL_ELEMENTS[el.toLowerCase()] || el)
    .join(', ');

  const prompt = `Educational illustration showing the concept of "${concept}"
with visual elements including: ${visualDescriptions}.
Center the main concept with supporting icons arranged around it in circles,
connected by dotted lines or arrows. Use visual metaphors to represent abstract ideas.`;

  return generateFluxImage(prompt, { style });
}

export async function generateComparisonVisual(
  leftConcept: string,
  rightConcept: string,
  style: 'illustrated' | 'minimalist' | 'technical' = 'illustrated',
): Promise<GeneratedVisual> {
  const prompt = `Side-by-side comparison illustration.
Left side shows "${leftConcept}" with relevant icons.
Right side shows "${rightConcept}" with contrasting icons.
Divide the image with a vertical line or vs symbol in the middle.
Use appropriate visual metaphors for each concept.`;

  return generateFluxImage(prompt, { style });
}

export async function generateFlowVisual(
  steps: string[],
  title: string,
  style: 'illustrated' | 'minimalist' | 'technical' = 'illustrated',
): Promise<GeneratedVisual> {
  const stepsDescription = steps.map((s, i) => `Step ${i + 1}: ${s}`).join(', ');

  const prompt = `Flowchart or process diagram illustration for "${title}".
Show a horizontal or vertical flow with ${steps.length} connected stages.
${stepsDescription}.
Use arrows to show progression from one stage to the next.
Include relevant icons for each stage.`;

  return generateFluxImage(prompt, { style });
}

export async function generateTitleVisual(
  title: string,
  topic: string,
  style: 'illustrated' | 'minimalist' | 'technical' = 'illustrated',
): Promise<GeneratedVisual> {
  const prompt = `Title slide illustration for "${title}" about ${topic}.
Central focal point with decorative elements around the edges.
Open books, thought bubbles, and knowledge icons scattered around.
Educational and welcoming atmosphere.
Leave space in the center for text overlay.`;

  return generateFluxImage(prompt, { style });
}

export async function generateSummaryVisual(
  keyPoints: string[],
  style: 'illustrated' | 'minimalist' | 'technical' = 'illustrated',
): Promise<GeneratedVisual> {
  const prompt = `Summary slide illustration with a checklist or key takeaways theme.
Show ${keyPoints.length} main icons representing completion or achievement.
Trophy, checkmarks, light bulbs, and graduation cap elements.
Celebratory but professional educational feel.`;

  return generateFluxImage(prompt, { style });
}

function generatePlaceholder(prompt: string, style: string): GeneratedVisual {
  const colors = {
    illustrated: { bg: '#FEF9E7', fg: '#1a1a1a', accent: '#F4D03F' },
    minimalist: { bg: '#FFFFFF', fg: '#333333', accent: '#6366F1' },
    technical: { bg: '#0a192f', fg: '#64ffda', accent: '#64ffda' },
  };

  const c = colors[style as keyof typeof colors] || colors.illustrated;
  const svgPlaceholder = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1344" height="768" viewBox="0 0 1344 768">
      <rect width="100%" height="100%" fill="${c.bg}"/>
      <circle cx="672" cy="384" r="120" fill="${c.accent}" opacity="0.2"/>
      <circle cx="672" cy="384" r="80" fill="${c.accent}" opacity="0.3"/>
      <text x="672" y="390" text-anchor="middle" font-family="Arial" font-size="24" fill="${c.fg}">
        Visual Placeholder
      </text>
      <text x="672" y="430" text-anchor="middle" font-family="Arial" font-size="14" fill="${c.fg}" opacity="0.6">
        ${prompt.substring(0, 50)}...
      </text>
    </svg>
  `;

  const base64Svg = `data:image/svg+xml;base64,${btoa(svgPlaceholder)}`;

  return {
    imageUrl: base64Svg,
    imageBase64: base64Svg,
    prompt,
    style,
  };
}

export async function generateMultipleVisuals(
  requests: Array<{ prompt: string; style: FluxImageOptions['style'] }>,
  onProgress?: (current: number, total: number) => void,
): Promise<GeneratedVisual[]> {
  const results: GeneratedVisual[] = [];
  const batchSize = 2;

  for (let i = 0; i < requests.length; i += batchSize) {
    const batch = requests.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((req) => generateFluxImage(req.prompt, { style: req.style })),
    );

    results.push(...batchResults);
    onProgress?.(Math.min(i + batchSize, requests.length), requests.length);

    if (i + batchSize < requests.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}
