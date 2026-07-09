import { supabase } from './supabase/client';

export interface GeneratedImage {
  id: string;
  prompt: string;
  url: string;
  base64?: string;
  type: 'chart' | 'diagram' | 'infographic' | 'illustration';
  caption: string;
}

export interface ImageGenerationRequest {
  type: 'chart' | 'diagram' | 'infographic' | 'illustration';
  description: string;
  context: string;
  style?: 'professional' | 'minimalist' | 'colorful' | 'technical';
}

export async function generateReportImage(
  request: ImageGenerationRequest,
): Promise<GeneratedImage> {
  const { data, error } = await supabase.functions.invoke('image', {
    body: {
      type: request.type,
      description: request.description,
      context: request.context,
      style: request.style || 'professional',
      provider: 'openai-image',
    },
  });

  if (error) {
    throw new Error(`Image function failed: ${error.message}`);
  }

  if (!data?.base64 && !data?.url) {
    throw new Error('Image function did not return image data.');
  }

  return {
    id: data.id || crypto.randomUUID(),
    prompt: request.description,
    url: data.url || '',
    base64: data.base64,
    type: request.type,
    caption: request.description,
  };
}

export async function generateReportImages(
  reportContent: string,
  reportTitle: string,
  maxImages: number = 3,
): Promise<GeneratedImage[]> {
  const { data, error } = await supabase.functions.invoke('image', {
    body: {
      action: 'suggest-and-generate',
      reportContent: reportContent.substring(0, 8000),
      reportTitle,
      maxImages,
      provider: 'openai-image',
    },
  });

  if (error) {
    console.error('Image function failed:', error);
    return [];
  }

  return Array.isArray(data?.images) ? data.images : [];
}

export async function generateConceptDiagram(
  concept: string,
  relatedEntities: string[],
  relationships: string[],
): Promise<GeneratedImage> {
  const diagramDescription = `
Concept map visualization showing:
- Central concept: "${concept}"
- Related elements: ${relatedEntities.slice(0, 8).join(', ')}
- Connections: ${relationships.slice(0, 5).join('; ')}

Style: Modern knowledge graph, nodes connected with labeled edges,
hierarchical layout, purple/blue color scheme, clean white background`;

  return generateReportImage({
    type: 'diagram',
    description: diagramDescription,
    context: `Visualizing the knowledge structure around ${concept}`,
    style: 'professional',
  });
}

export async function generateStatsInfographic(
  title: string,
  stats: { label: string; value: string }[],
): Promise<GeneratedImage> {
  const statsDescription = stats
    .slice(0, 6)
    .map((s) => `${s.label}: ${s.value}`)
    .join(', ');

  return generateReportImage({
    type: 'infographic',
    description: `Statistics infographic showing: ${statsDescription}`,
    context: `Key metrics visualization for ${title}`,
    style: 'colorful',
  });
}
