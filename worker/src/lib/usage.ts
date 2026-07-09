import { pool } from './db.js';
import { JobRecord } from '../models.js';

interface TrackedCompletionInput {
  job: JobRecord;
  phase: string;
  provider?: string;
  model?: string;
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json_object';
}

interface TrackedCompletionOutput {
  content: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

const OPENAI_MODEL_COSTS: Record<string, { in: number; out: number }> = {
  'gpt-4o-mini': { in: 0.00000015, out: 0.0000006 },
  'gpt-5.4-mini': { in: 0, out: 0 },
  'gpt-5.4-low': { in: 0, out: 0 },
  'gpt-5.4': { in: 0, out: 0 },
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateCost(provider: string, model: string, tokensIn: number, tokensOut: number): number {
  const costs = OPENAI_MODEL_COSTS[model];
  if (!costs) return 0;
  return Number(((tokensIn * costs.in) + (tokensOut * costs.out)).toFixed(6));
}

export async function recordUsage(input: {
  job: JobRecord;
  provider: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  chars?: number;
  images?: number;
  costUsd: number;
}): Promise<void> {
  await pool.query(
    `
    INSERT INTO public.usage_events (
      user_id, job_id, provider, model, tokens_in, tokens_out, chars, images, cost_usd
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      input.job.user_id,
      input.job.id,
      input.provider,
      input.model,
      input.tokensIn ?? null,
      input.tokensOut ?? null,
      input.chars ?? null,
      input.images ?? null,
      input.costUsd,
    ],
  );

  await pool.query(
    `
    UPDATE public.jobs
    SET cost_usd = COALESCE(cost_usd, 0) + $2
    WHERE id = $1
    `,
    [input.job.id, input.costUsd],
  );
}

export async function trackedCompletion(input: TrackedCompletionInput): Promise<TrackedCompletionOutput> {
  const provider = input.provider || (process.env.LINGSHI_API_KEY ? 'lingshi' : 'openai');
  const apiKey = provider === 'lingshi' ? process.env.LINGSHI_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(`${provider === 'lingshi' ? 'LINGSHI_API_KEY' : 'OPENAI_API_KEY'} is required.`);
  }

  const model = input.model
    || (provider === 'lingshi'
      ? process.env.LINGSHI_DOCUMENT_MODEL || 'gpt-5.4-mini'
      : process.env.OPENAI_DOCUMENT_MODEL || 'gpt-4o-mini');
  const endpoint = provider === 'lingshi'
    ? `${(process.env.LINGSHI_BASE_URL || 'https://api.lingshi.chat').replace(/\/+$/, '')}/v1/chat/completions`
    : 'https://api.openai.com/v1/chat/completions';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.prompt },
      ],
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 4096,
      ...(input.responseFormat ? { response_format: { type: input.responseFormat } } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const completion = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = completion.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`${input.phase} returned no content.`);
  }

  const tokensIn = completion.usage?.prompt_tokens ?? estimateTokens(input.system + input.prompt);
  const tokensOut = completion.usage?.completion_tokens ?? estimateTokens(content);
  const costUsd = estimateCost(provider, model, tokensIn, tokensOut);

  await recordUsage({
    job: input.job,
    provider,
    model,
    tokensIn,
    tokensOut,
    chars: input.prompt.length + content.length,
    costUsd,
  });

  return { content, provider, model, tokensIn, tokensOut, costUsd };
}
