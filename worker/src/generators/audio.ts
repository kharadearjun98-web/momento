import { pool } from '../lib/db.js';
import { createServiceClient } from '../lib/supabase.js';
import { mixMp3Segments, AudioSegmentInput } from '../lib/ffmpeg.js';
import { JobRecord, PhaseResult } from '../models.js';
import { recordUsage, trackedCompletion } from '../lib/usage.js';
import { mapWithConcurrency } from '../lib/concurrency.js';

// How many narration segments to synthesize at once. Bounded so we don't hit
// OpenAI rate limits. Override via env if needed.
const TTS_CONCURRENCY = Number(process.env.TTS_CONCURRENCY) || 4;

interface AudioScriptSegment {
  speaker?: string;
  text: string;
  voice?: string;
}

const formatPrompts: Record<string, string> = {
  solo: 'Create an engaging educational monologue where a single speaker explains the topic clearly and thoroughly.',
  'deep-dive': 'Create an in-depth educational podcast where two hosts explore the topic thoroughly with examples.',
  critical: 'Create a critical analysis podcast where two hosts examine the topic from multiple perspectives.',
  debate: 'Create a debate-style podcast where two hosts present contrasting viewpoints respectfully.',
  analysis: 'Create an analytical podcast where two hosts systematically break down the topic and draw insights.',
};

function parseDuration(duration: unknown): number {
  if (duration === '30min') return 4500;
  if (duration === '1hr') return 9000;
  if (duration === '3hr') return 18000;
  if (typeof duration === 'string') {
    const match = duration.match(/^(\d+)min$/);
    if (match) return Math.max(300, Math.min(Number(match[1]) * 150, 18000));
  }
  return 1500;
}

function parseScript(scriptText: string, format: string): AudioScriptSegment[] {
  const segments: AudioScriptSegment[] = [];
  for (const line of scriptText.split('\n')) {
    const host1 = line.match(/^HOST\s*1\s*:\s*(.+)$/i);
    const host2 = line.match(/^HOST\s*2\s*:\s*(.+)$/i);
    const solo = line.match(/^SOLO\s*:\s*(.+)$/i);

    if (solo?.[1]?.trim()) segments.push({ speaker: 'solo', text: solo[1].trim() });
    if (host1?.[1]?.trim()) segments.push({ speaker: 'host1', text: host1[1].trim() });
    if (host2?.[1]?.trim()) segments.push({ speaker: 'host2', text: host2[1].trim() });
  }

  if (segments.length > 0) return segments;
  return [{ speaker: format === 'solo' ? 'solo' : 'host1', text: scriptText.trim() }];
}

async function generateScript(job: JobRecord, input: Record<string, unknown>): Promise<AudioScriptSegment[]> {
  const supabase = createServiceClient();
  const notebookId = String(input.notebookId || '');
  const format = typeof input.format === 'string' ? input.format : 'deep-dive';
  const targetWords = parseDuration(input.duration);
  const speakerNames = input.speakerNames && typeof input.speakerNames === 'object'
    ? input.speakerNames as Record<string, string>
    : {};
  const speakerPersonalities = input.speakerPersonalities && typeof input.speakerPersonalities === 'object'
    ? input.speakerPersonalities as Record<string, string>
    : {};

  const { data: sources, error } = await supabase
    .from('sources')
    .select('title, content')
    .eq('notebook_id', notebookId);

  if (error) throw error;
  const sourceText = (sources || [])
    .filter((source) => typeof source.content === 'string' && source.content.trim().length > 0)
    .slice(0, 12)
    .map((source) => `# ${source.title}\n${String(source.content).slice(0, 2500)}`)
    .join('\n\n');

  if (!sourceText.trim()) {
    throw new Error('No processed source content found for this notebook.');
  }

  const host1Name = speakerNames.host1 || 'Alex';
  const host2Name = speakerNames.host2 || 'Jordan';
  const soloName = speakerNames.solo || 'Alex';
  const speakerInstruction = format === 'solo'
    ? `Use this exact line format: SOLO: [spoken text]\nSpeaker ${soloName}: ${speakerPersonalities.solo || 'knowledgeable and clear'}`
    : `Use this exact line format only:\nHOST1: [spoken text]\nHOST2: [spoken text]\nHost 1 ${host1Name}: ${speakerPersonalities.host1 || 'curious and energetic'}\nHost 2 ${host2Name}: ${speakerPersonalities.host2 || 'analytical and clear'}`;

  const prompt = `${formatPrompts[format] || formatPrompts['deep-dive']}

Target about ${targetWords} words. Do not include stage directions, markdown, headings, or conclusions like "thanks for listening".
${input.customPrompt ? `Special instructions: ${input.customPrompt}` : ''}

${speakerInstruction}

Notebook source material:
${sourceText}`;

  await recordPhase(job, 'audio:script:start', { sourceCount: sources?.length || 0, targetWords });

  const completion = await trackedCompletion({
    job,
    phase: 'audio:script:completion',
    model: process.env.LINGSHI_AUDIO_MODEL || process.env.OPENAI_AUDIO_MODEL,
    system: 'You write clean podcast scripts that are easy to parse into TTS segments.',
    prompt,
    temperature: 0.85,
    maxTokens: 4096,
  });
  const scriptText = completion.content;
  if (!scriptText) {
    throw new Error('Script generation returned no content.');
  }

  const segments = parseScript(scriptText, format);
  await recordPhase(job, 'audio:script', { segmentCount: segments.length, transcript: scriptText });
  return segments;
}

async function normalizeSegments(
  job: JobRecord,
  input: Record<string, unknown>,
  completedPhases: Set<string>,
): Promise<AudioScriptSegment[]> {
  const directSegments = input.segments;
  const script = input.script && typeof input.script === 'object'
    ? input.script as Record<string, unknown>
    : undefined;
  const scriptSegments = script?.segments;
  const segments = Array.isArray(directSegments) ? directSegments : scriptSegments;

  if (Array.isArray(segments)) {
    const normalized = segments
      .filter((item) => item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string')
      .map((item, index) => {
        const segment = item as { speaker?: string; text: string; voice?: string };
        return {
          speaker: segment.speaker || `segment-${index + 1}`,
          text: segment.text,
          voice: segment.voice,
        };
      });
    await recordPhase(job, 'audio:script', { segmentCount: normalized.length });
    return normalized;
  }

  const fallbackText = [input.prompt, input.message, input.text]
    .find((value) => typeof value === 'string' && value.trim().length > 0);

  if (typeof fallbackText === 'string') {
    await recordPhase(job, 'audio:script', { segmentCount: 1 });
    return [{ speaker: 'solo', text: fallbackText }];
  }

  if (completedPhases.has('audio:script')) {
    const output = await getPhaseOutput(job.id, 'audio:script');
    if (typeof output?.transcript === 'string') {
      const format = typeof input.format === 'string' ? input.format : 'deep-dive';
      return parseScript(output.transcript, format);
    }
  }

  return generateScript(job, input);
}

function voiceFor(segment: AudioScriptSegment): string {
  if (segment.voice) return segment.voice;
  if (segment.speaker === 'host1') return 'onyx';
  if (segment.speaker === 'host2') return 'nova';
  return 'alloy';
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

async function getCompletedSegmentPaths(jobId: string): Promise<Map<number, string>> {
  const result = await pool.query<{ phase: string; storage_path: string }>(
    `
    SELECT phase, storage_path
    FROM public.job_phases
    WHERE job_id = $1
      AND phase LIKE 'tts:segment:%'
      AND storage_path IS NOT NULL
    `,
    [jobId],
  );

  const paths = new Map<number, string>();
  for (const row of result.rows) {
    const index = Number(row.phase.split(':').at(-1));
    if (Number.isInteger(index)) {
      paths.set(index, row.storage_path);
    }
  }
  return paths;
}

async function getPhaseOutput(jobId: string, phase: string): Promise<Record<string, unknown> | null> {
  const result = await pool.query<{ output_jsonb: Record<string, unknown> | null }>(
    `
    SELECT output_jsonb
    FROM public.job_phases
    WHERE job_id = $1 AND phase = $2
    LIMIT 1
    `,
    [jobId, phase],
  );

  return result.rows[0]?.output_jsonb ?? null;
}

async function synthesize(job: JobRecord, segment: AudioScriptSegment): Promise<Buffer> {
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
      voice: voiceFor(segment),
      input: segment.text,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const chars = segment.text.length;
  await recordUsage({
    job,
    provider: 'openai',
    model: 'tts-1',
    chars,
    costUsd: Number(((chars / 1000) * 0.015).toFixed(6)),
  });
  return buffer;
}

export async function runAudioJob(job: JobRecord, completedPhases: Set<string>): Promise<PhaseResult[]> {
  const supabase = createServiceClient();
  const input = job.input_jsonb;
  const notebookId = typeof input.notebookId === 'string' ? input.notebookId : 'audio';
  const segments = await normalizeSegments(job, input, completedPhases);
  const completedSegmentPaths = await getCompletedSegmentPaths(job.id);

  // Synthesize narration segments in parallel batches. mapWithConcurrency
  // preserves order, so segments still stitch together in the right sequence.
  // Already-completed segments (from a prior attempt) are downloaded, not
  // re-synthesized, so retries stay cheap.
  let ttsDone = 0;
  const segmentBuffers = await mapWithConcurrency(segments, TTS_CONCURRENCY, async (segment, index) => {
    const phase = `tts:segment:${index}`;
    const storagePath = completedSegmentPaths.get(index) || `${notebookId}/jobs/${job.id}/segments/${index}.mp3`;
    let buffer: Buffer;

    if (!completedSegmentPaths.has(index)) {
      buffer = await synthesize(job, segment);
      const { error } = await supabase.storage
        .from('assets')
        .upload(storagePath, buffer, {
          contentType: 'audio/mpeg',
          upsert: true,
        });

      if (error) throw error;
      await recordPhase(job, phase, { index, speaker: segment.speaker }, storagePath);
    } else {
      const { data, error } = await supabase.storage.from('assets').download(storagePath);
      if (error || !data) throw error || new Error(`Could not download TTS segment ${index}`);
      buffer = Buffer.from(await data.arrayBuffer());
    }

    ttsDone++;
    await pool.query(
      `
      UPDATE public.jobs
      SET phase = $2,
          progress_pct = GREATEST(progress_pct, $3)
      WHERE id = $1
      `,
      [job.id, phase, Math.round((ttsDone / segments.length) * 70)],
    );

    return buffer;
  });

  const audioSegments: AudioSegmentInput[] = segmentBuffers.map((buffer, index) => ({
    key: String(index).padStart(5, '0'),
    buffer,
  }));

  const mixed = await mixMp3Segments(audioSegments, Number(input.silenceGapMs ?? 200));
  const finalPath = `${notebookId}/jobs/${job.id}/audio.mp3`;
  const { error: uploadError } = await supabase.storage
    .from('assets')
    .upload(finalPath, mixed.buffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    });

  if (uploadError) throw uploadError;
  await recordPhase(job, 'audio:mix', { duration: mixed.duration, segmentCount: segments.length }, finalPath);

  const { data: urlData } = supabase.storage.from('assets').getPublicUrl(finalPath);
  const metadata = {
    format: input.format,
    duration: input.duration,
    graphMode: input.graphMode,
    speakerNames: input.speakerNames,
    speakerPersonalities: input.speakerPersonalities,
    jobId: job.id,
  };
  const transcript = segments.map((segment) => `${segment.speaker || 'speaker'}: ${segment.text}`).join('\n\n');

  const { error: assetError } = await supabase
    .from('generated_assets')
    .insert({
      notebook_id: notebookId,
      type: 'audio',
      title: typeof input.title === 'string' ? input.title : 'Audio Overview',
      media_url: urlData.publicUrl,
      transcript,
      duration_seconds: Math.round(mixed.duration),
      metadata,
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
    phase: 'audio:completed',
    progressPct: 100,
    storagePath: finalPath,
    output: {
      duration: mixed.duration,
      segmentCount: segments.length,
      storagePath: finalPath,
    },
  }];
}
