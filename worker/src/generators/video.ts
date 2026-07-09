import { pool } from '../lib/db.js';
import { createServiceClient } from '../lib/supabase.js';
import { mixMp3Segments, AudioSegmentInput } from '../lib/ffmpeg.js';
import { JobRecord, PhaseResult } from '../models.js';
import { recordUsage, trackedCompletion } from '../lib/usage.js';
import { mapWithConcurrency } from '../lib/concurrency.js';

// Narrator voice for slide narration (clear, professional).
const NARRATOR_VOICE = 'nova';

// How many slide images / narration segments to generate at once. Bounded so we
// don't hit OpenAI rate limits. Override via env if needed.
const IMAGE_CONCURRENCY = Number(process.env.IMAGE_CONCURRENCY) || 4;
const TTS_CONCURRENCY = Number(process.env.TTS_CONCURRENCY) || 4;

interface VideoSlide {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  bullets?: string[];
  formula?: string;
  mermaidCode?: string;
  imagePrompt?: string;
  imageUrl?: string;
  narration: string;
  durationMs: number;
  notes?: string;
}

const DURATION_TO_SLIDES: Record<string, number> = {
  '5min': 8,
  '10min': 15,
  '20min': 30,
};

const DURATION_TO_WORDS: Record<string, number> = {
  '5min': 750,
  '10min': 1500,
  '20min': 3000,
};

const FORMAT_PROMPTS: Record<string, string> = {
  'deep-dive': 'Create an in-depth educational presentation that thoroughly explains the topic with detailed explanations and examples.',
  summary: 'Create a quick recap presentation hitting the key points concisely. Focus on highlights and takeaways.',
  debate: 'Create a presentation that explores multiple perspectives and contrasting viewpoints on the topic.',
  analysis: 'Create an analytical presentation that systematically breaks down the topic into components and examines each.',
};

const STYLE_INSTRUCTIONS: Record<string, string> = {
  minimalist: 'Clean, simple visuals with minimal elements. Use whitespace effectively. Icons should be simple line drawings.',
  illustrated: 'Hand-drawn style illustrations like NotebookLM. Warm yellow/cream backgrounds with playful icons. Think whiteboard sketches.',
  technical: 'Blueprint-style diagrams with precise lines. Technical drawing aesthetic. Use grids and measurement-like annotations.',
  corporate: 'Professional business style with clean gradients. Modern corporate design with subtle shadows.',
};

const STYLE_IMAGE_ENHANCEMENTS: Record<string, string> = {
  minimalist: 'Minimalist design, simple flat icons, clean lines, lots of white space, subtle shadows, modern vector style, white background',
  illustrated: 'Hand-drawn illustration style, warm cream/yellow background, playful sketchy icons, educational whiteboard aesthetic, soft watercolor textures, rounded shapes, friendly educational feel, like Google NotebookLM visual style',
  technical: 'Technical blueprint style, precise geometric lines, grid background, measurement annotations, engineering diagram aesthetic, blue and white color scheme',
  corporate: 'Professional corporate design, clean gradients, subtle 3D depth, modern business infographic style, blue and gray color palette',
};

/**
 * Reasoning models (e.g. LINGSHI gpt-5.4-mini) wrap output in <think>...</think>
 * and/or code fences. Strip those and isolate the JSON object before parsing.
 */
function parseJson(content: string): Record<string, unknown> {
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);
  return JSON.parse(cleaned) as Record<string, unknown>;
}

async function recordPhase(job: JobRecord, phase: string, output: Record<string, unknown>, storagePath?: string) {
  await pool.query(
    `
    INSERT INTO public.job_phases (job_id, phase, output_jsonb, storage_path)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (job_id, phase) DO UPDATE
    SET output_jsonb = EXCLUDED.output_jsonb,
        storage_path = EXCLUDED.storage_path,
        completed_at = now()
    `,
    [job.id, phase, output, storagePath ?? null],
  );
}

async function setProgress(jobId: string, phase: string, progressPct: number) {
  await pool.query(
    `
    UPDATE public.jobs
    SET phase = $2,
        progress_pct = GREATEST(progress_pct, $3)
    WHERE id = $1
    `,
    [jobId, phase, Math.round(progressPct)],
  );
}

/**
 * Ask the LLM for the slide deck (titles, bullets, narration, image prompts).
 */
async function generateSlides(job: JobRecord, input: Record<string, unknown>): Promise<{ slides: VideoSlide[]; topic: string }> {
  const supabase = createServiceClient();
  const notebookId = String(input.notebookId || '');
  const format = typeof input.format === 'string' ? input.format : 'deep-dive';
  const duration = typeof input.duration === 'string' ? input.duration : '5min';
  const style = typeof input.style === 'string' ? input.style : 'illustrated';
  const customPrompt = typeof input.customPrompt === 'string' ? input.customPrompt : undefined;

  const { data: sources, error } = await supabase
    .from('sources')
    .select('title, content')
    .eq('notebook_id', notebookId);

  if (error) throw error;
  const withContent = (sources || []).filter(
    (source) => typeof source.content === 'string' && source.content.trim().length > 0,
  );
  if (withContent.length === 0) {
    throw new Error('No processed source content found for this notebook.');
  }

  const combinedContent = withContent
    .slice(0, 12)
    .map((source) => `# ${source.title}\n${String(source.content).slice(0, 3000)}`)
    .join('\n\n')
    .slice(0, 10000);

  const targetSlides = DURATION_TO_SLIDES[duration] || 15;
  const targetWords = DURATION_TO_WORDS[duration] || 1500;
  const wordsPerSlide = Math.floor(targetWords / targetSlides);

  const prompt = `You are creating a video presentation script with synchronized slides and narration.

${FORMAT_PROMPTS[format] || FORMAT_PROMPTS['deep-dive']}

REQUIREMENTS:
- Generate exactly ${targetSlides} slides
- Total narration should be approximately ${targetWords} words (~${wordsPerSlide} words per slide)
- Style: ${style} - ${STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.illustrated}
${customPrompt ? `- Special focus: ${customPrompt}` : ''}

CONTENT:
${combinedContent}

OUTPUT FORMAT:
Return a JSON object with a "slides" key containing an array. Each slide must have:
{
  "type": "title|section|content|comparison|diagram|quote|summary|stats",
  "title": "Slide Title",
  "subtitle": "Optional subtitle",
  "bullets": ["Point 1", "Point 2", "Point 3"],
  "formula": "LaTeX formula if applicable",
  "mermaidCode": "For 'diagram' slides ONLY: Mermaid.js code. Omit otherwise.",
  "imagePrompt": "A prompt that DIRECTLY VISUALIZES the concept. NO TEXT IN IMAGES. Omit for diagram slides that use mermaidCode.",
  "narration": "What the speaker says during this slide. Natural, conversational, educational tone. About ${wordsPerSlide} words.",
  "notes": "Additional speaker notes"
}

Return ONLY the JSON object: { "slides": [...] }`;

  await recordPhase(job, 'video:script:start', { targetSlides, targetWords, sourceCount: withContent.length });

  const completion = await trackedCompletion({
    job,
    phase: 'video:script:completion',
    system: 'You are an expert educational content creator specializing in visual presentations. Always respond with a valid JSON object containing a "slides" key with an array of slide objects.',
    prompt,
    temperature: 0.7,
    maxTokens: 8000,
    responseFormat: 'json_object',
  });

  const parsed = parseJson(completion.content);
  const rawSlides = Array.isArray(parsed.slides) ? parsed.slides : [];
  if (rawSlides.length === 0) {
    throw new Error('Slide generation returned no slides.');
  }

  const slides: VideoSlide[] = rawSlides.map((raw, index) => {
    const slide = raw as Record<string, unknown>;
    const narration = typeof slide.narration === 'string' ? slide.narration : '';
    const wordCount = narration.split(/\s+/).filter(Boolean).length;
    const durationMs = Math.max(5000, Math.round((wordCount / 150) * 60 * 1000));
    return {
      id: crypto.randomUUID(),
      type: typeof slide.type === 'string' ? slide.type : 'content',
      title: typeof slide.title === 'string' ? slide.title : `Slide ${index + 1}`,
      subtitle: typeof slide.subtitle === 'string' ? slide.subtitle : undefined,
      bullets: Array.isArray(slide.bullets) ? slide.bullets.filter((b): b is string => typeof b === 'string') : [],
      formula: typeof slide.formula === 'string' ? slide.formula : undefined,
      mermaidCode: typeof slide.mermaidCode === 'string' ? slide.mermaidCode : undefined,
      imagePrompt: typeof slide.imagePrompt === 'string' ? slide.imagePrompt : undefined,
      narration,
      durationMs,
      notes: typeof slide.notes === 'string' ? slide.notes : undefined,
    };
  });

  const topic = withContent[0]?.title || 'Video Overview';
  await recordPhase(job, 'video:script', { slideCount: slides.length, topic });
  return { slides, topic };
}

/**
 * Generate one slide illustration via OpenAI images. Returns a PNG buffer or null.
 * Images are best-effort: a failure here must not kill the whole video job.
 */
async function generateSlideImage(job: JobRecord, slide: VideoSlide, style: string): Promise<Buffer | null> {
  if (!slide.imagePrompt || slide.mermaidCode) return null;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const prompt = `${slide.imagePrompt}

Style: ${STYLE_IMAGE_ENHANCEMENTS[style] || STYLE_IMAGE_ENHANCEMENTS.illustrated}

IMPORTANT:
- NO text, labels, or words of any kind
- Clean, educational illustration suitable for a presentation slide
- High contrast for visibility
- Focus on visual metaphors and icons`;

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt,
        n: 1,
        size: '1024x1024',
        quality: 'low',
      }),
    });

    if (!response.ok) {
      console.warn(`image generation failed for slide "${slide.title}": ${await response.text()}`);
      return null;
    }

    const data = await response.json() as { data?: Array<{ b64_json?: string }> };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return null;

    await recordUsage({
      job,
      provider: 'openai',
      model: 'gpt-image-1',
      images: 1,
      costUsd: 0.011,
    });
    return Buffer.from(b64, 'base64');
  } catch (error) {
    console.warn(`image generation error for slide "${slide.title}":`, error);
    return null;
  }
}

async function synthesizeNarration(job: JobRecord, text: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for worker TTS.');
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: NARRATOR_VOICE,
      input: text,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await recordUsage({
    job,
    provider: 'openai',
    model: 'tts-1',
    chars: text.length,
    costUsd: Number(((text.length / 1000) * 0.015).toFixed(6)),
  });
  return buffer;
}

export async function runVideoJob(job: JobRecord, _completedPhases: Set<string>): Promise<PhaseResult[]> {
  const supabase = createServiceClient();
  const input = job.input_jsonb;
  const notebookId = typeof input.notebookId === 'string' ? input.notebookId : '';
  if (!notebookId) throw new Error('video jobs require input.notebookId.');
  const style = typeof input.style === 'string' ? input.style : 'illustrated';

  // PHASE 1: slide script
  await setProgress(job.id, 'video:script', 5);
  const { slides, topic } = await generateSlides(job, input);
  await setProgress(job.id, 'video:script', 15);

  // PHASE 2: slide images (best-effort), generated in parallel batches.
  const slidesWithImages = slides.filter((slide) => slide.imagePrompt && !slide.mermaidCode);
  let imagesDone = 0;
  await mapWithConcurrency(slidesWithImages, IMAGE_CONCURRENCY, async (slide, index) => {
    const image = await generateSlideImage(job, slide, style);
    if (image) {
      const storagePath = `${notebookId}/jobs/${job.id}/slides/${slide.id}.png`;
      const { error } = await supabase.storage
        .from('assets')
        .upload(storagePath, image, { contentType: 'image/png', upsert: true });
      if (!error) {
        slide.imageUrl = supabase.storage.from('assets').getPublicUrl(storagePath).data.publicUrl;
      }
    }
    imagesDone++;
    await setProgress(job.id, `image:slide:${index}`, 15 + (imagesDone / Math.max(slidesWithImages.length, 1)) * 30);
  });

  // PHASE 3: narration TTS, generated in parallel batches. mapWithConcurrency
  // preserves order, so segments still stitch together in the right sequence.
  const narratedSlides = slides.filter((slide) => slide.narration && slide.narration.trim().length > 0);
  let ttsDone = 0;
  const ttsResults = await mapWithConcurrency(narratedSlides, TTS_CONCURRENCY, async (slide, index) => {
    const audio = await synthesizeNarration(job, slide.narration);
    const storagePath = `${notebookId}/jobs/${job.id}/segments/${index}.mp3`;
    const { error } = await supabase.storage
      .from('assets')
      .upload(storagePath, audio, { contentType: 'audio/mpeg', upsert: true });
    if (error) throw error;

    await recordPhase(job, `tts:segment:${index}`, { index, slideId: slide.id }, storagePath);
    ttsDone++;
    await setProgress(job.id, `tts:segment:${index}`, 45 + (ttsDone / Math.max(narratedSlides.length, 1)) * 40);
    return { buffer: audio, wordCount: slide.narration.split(/\s+/).filter(Boolean).length };
  });

  const audioSegments: AudioSegmentInput[] = ttsResults.map((result, index) => ({
    key: String(index).padStart(5, '0'),
    buffer: result.buffer,
  }));
  const segmentWordCounts: number[] = ttsResults.map((result) => result.wordCount);

  if (audioSegments.length === 0) {
    throw new Error('No narration was generated for this video.');
  }

  // PHASE 4: mix audio with FFmpeg
  await setProgress(job.id, 'video:mix', 88);
  const silenceGapMs = 500;
  const mixed = await mixMp3Segments(audioSegments, silenceGapMs);
  const audioPath = `${notebookId}/jobs/${job.id}/audio.mp3`;
  const { error: audioUploadError } = await supabase.storage
    .from('assets')
    .upload(audioPath, mixed.buffer, { contentType: 'audio/mpeg', upsert: true });
  if (audioUploadError) throw audioUploadError;
  const audioUrl = supabase.storage.from('assets').getPublicUrl(audioPath).data.publicUrl;
  await recordPhase(job, 'video:mix', { duration: mixed.duration, segmentCount: audioSegments.length }, audioPath);

  // PHASE 5: build slide timings from actual total audio duration.
  // Distribute the mixed audio length across slides proportional to narration length.
  const totalDurationMs = Math.round(mixed.duration * 1000);
  const totalWords = segmentWordCounts.reduce((sum, count) => sum + count, 0) || narratedSlides.length;
  let cursorMs = 0;
  const slideTimings = narratedSlides.map((slide, index) => {
    const share = (segmentWordCounts[index] || 1) / totalWords;
    const startMs = cursorMs;
    const endMs = index === narratedSlides.length - 1 ? totalDurationMs : Math.round(cursorMs + share * totalDurationMs);
    cursorMs = endMs;
    return { slideId: slide.id, startMs, endMs };
  });

  await setProgress(job.id, 'video:upload', 95);

  // PHASE 6: persist the asset (shape matches the previous browser saveVideoOverview).
  const slidesForStorage = slides.map((slide) => ({
    ...slide,
    imageUrl: slide.imageUrl || null,
  }));
  const totalNarrationWords = slides.reduce(
    (sum, slide) => sum + slide.narration.split(/\s+/).filter(Boolean).length,
    0,
  );

  const { error: assetError } = await supabase
    .from('generated_assets')
    .insert({
      notebook_id: notebookId,
      type: 'video_overview',
      title: typeof input.title === 'string' ? input.title : topic,
      media_url: audioUrl,
      duration_seconds: Math.round(mixed.duration),
      transcript: slides.map((slide) => slide.narration).join('\n\n'),
      metadata: {
        format: input.format,
        duration: input.duration,
        style,
        slideCount: slides.length,
        wordCount: totalNarrationWords,
        createdAt: new Date().toISOString(),
        slideTimings,
        slides: slidesForStorage,
        jobId: job.id,
      },
    });
  if (assetError) throw assetError;

  if (typeof input.replaceAssetId === 'string') {
    await supabase
      .from('generated_assets')
      .delete()
      .eq('id', input.replaceAssetId)
      .eq('notebook_id', notebookId);
  }

  return [{
    phase: 'video:completed',
    progressPct: 100,
    storagePath: audioPath,
    output: {
      duration: mixed.duration,
      slideCount: slides.length,
      segmentCount: audioSegments.length,
      storagePath: audioPath,
    },
  }];
}
