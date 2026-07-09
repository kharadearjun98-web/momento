import { createServiceClient } from '../lib/supabase.js';
import { trackedCompletion } from '../lib/usage.js';
import { JobRecord, PhaseResult } from '../models.js';
import { loadNotebookContext } from './documentContent.js';

function parseJson(content: string): Record<string, unknown> {
  // Some models (e.g. reasoning models) wrap their reasoning in <think>...</think>
  // before the answer. Strip that, then code fences, then isolate the JSON object.
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(cleaned) as Record<string, unknown>;
}

async function saveGeneratedAsset(input: {
  notebookId: string;
  type: string;
  title: string;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('generated_assets')
    .insert({
      notebook_id: input.notebookId,
      type: input.type,
      title: input.title,
      metadata: input.metadata,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export async function runQuizJob(job: JobRecord, completedPhases: Set<string>): Promise<PhaseResult[]> {
  if (completedPhases.has('quiz:saved')) return [];

  const input = job.input_jsonb;
  const notebookId = String(input.notebookId || '');
  if (!notebookId) throw new Error('Quiz jobs require input.notebookId.');

  const context = await loadNotebookContext(notebookId);
  const type = typeof input.type === 'string' ? input.type : 'Multiple Choice';
  const length = typeof input.length === 'string' ? input.length : '10 Questions';
  const difficulty = typeof input.difficulty === 'string' ? input.difficulty : 'Medium';
  const count = Number.parseInt(length, 10) || 10;
  const customPrompt = typeof input.customPrompt === 'string' ? input.customPrompt : undefined;

  const prompt = `Generate ${count} ${difficulty} quiz questions for "${context.title}".

Question format: ${type}.
${customPrompt ? `Learning goals: ${customPrompt}` : ''}

Return only valid JSON:
{
  "questions": [
    {
      "question": "Question text",
      "type": "multiple-choice" | "true-false" | "short-answer",
      "answers": [{"id":"a1","text":"Answer","isCorrect":true}],
      "correctAnswer": "a1",
      "explanation": "Why this is correct",
      "difficulty": "${difficulty}"
    }
  ]
}

Source material:
${context.sourceText.slice(0, 16000)}`;

  const result = await trackedCompletion({
    job,
    phase: 'quiz:completion',
    system: 'You are an expert assessment designer. Return strict JSON only.',
    prompt,
    responseFormat: 'json_object',
  });

  const parsed = parseJson(result.content);
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
  if (rawQuestions.length === 0) throw new Error('Quiz generation returned no questions.');

  const quiz = {
    id: crypto.randomUUID(),
    notebookId,
    title: `${context.title} - ${difficulty} ${type} Quiz`,
    questions: rawQuestions.map((question, index) => ({
      ...(question as Record<string, unknown>),
      id: (question as { id?: string }).id || `q-${index}`,
    })),
    metadata: {
      type,
      difficulty,
      totalQuestions: rawQuestions.length,
      createdAt: new Date().toISOString(),
      customPrompt,
    },
  };

  const assetId = await saveGeneratedAsset({
    notebookId,
    type: 'quiz',
    title: quiz.title,
    metadata: { quizData: quiz },
  });

  return [{ phase: 'quiz:saved', progressPct: 100, output: { assetId, totalQuestions: rawQuestions.length } }];
}

export async function runFlashcardsJob(job: JobRecord, completedPhases: Set<string>): Promise<PhaseResult[]> {
  if (completedPhases.has('flashcards:saved')) return [];

  const input = job.input_jsonb;
  const notebookId = String(input.notebookId || '');
  if (!notebookId) throw new Error('Flashcard jobs require input.notebookId.');

  const context = await loadNotebookContext(notebookId);
  const count = typeof input.count === 'string' ? input.count : '10 Cards';
  const difficulty = typeof input.difficulty === 'string' ? input.difficulty : 'Medium';
  const cardCount = Number.parseInt(count, 10) || 10;
  const customPrompt = typeof input.customPrompt === 'string' ? input.customPrompt : undefined;

  const prompt = `Generate exactly ${cardCount} ${difficulty} flashcards for "${context.title}".
${customPrompt ? `Focus topics: ${customPrompt}` : ''}

Return only valid JSON:
{
  "cards": [
    {
      "front": "Question or term",
      "back": "Answer",
      "hint": "Optional hint",
      "difficulty": "${difficulty}"
    }
  ]
}

Source material:
${context.sourceText.slice(0, 16000)}`;

  const result = await trackedCompletion({
    job,
    phase: 'flashcards:completion',
    system: 'You are an expert flashcard generator. Return strict JSON only.',
    prompt,
    responseFormat: 'json_object',
  });

  const parsed = parseJson(result.content);
  const rawCards = Array.isArray(parsed.cards) ? parsed.cards : [];
  if (rawCards.length === 0) throw new Error('Flashcard generation returned no cards.');

  const deck = {
    id: crypto.randomUUID(),
    notebookId,
    title: `${context.title} - ${difficulty} Flashcards`,
    cards: rawCards.map((card, index) => ({
      ...(card as Record<string, unknown>),
      id: (card as { id?: string }).id || `card-${index}`,
    })),
    metadata: {
      difficulty,
      totalCards: rawCards.length,
      createdAt: new Date().toISOString(),
      customPrompt,
    },
  };

  const assetId = await saveGeneratedAsset({
    notebookId,
    type: 'flashcards',
    title: deck.title,
    metadata: { flashcardData: deck },
  });

  return [{ phase: 'flashcards:saved', progressPct: 100, output: { assetId, totalCards: rawCards.length } }];
}

export async function runMindMapJob(job: JobRecord, completedPhases: Set<string>): Promise<PhaseResult[]> {
  if (completedPhases.has('mindmap:saved')) return [];

  const input = job.input_jsonb;
  const notebookId = String(input.notebookId || '');
  if (!notebookId) throw new Error('Mind map jobs require input.notebookId.');

  const context = await loadNotebookContext(notebookId);
  const style = typeof input.style === 'string' ? input.style : 'Hierarchical';
  const customPrompt = typeof input.customPrompt === 'string' ? input.customPrompt : undefined;

  const prompt = `Create a ${style} mind map for "${context.title}".
${customPrompt ? `Focus area: ${customPrompt}` : ''}

Return only valid JSON:
{
  "centralTopic": "Main topic",
  "nodes": [
    {"id":"node-1","label":"Main topic","description":"Brief description","type":"central"}
  ],
  "edges": [
    {"id":"edge-1","source":"node-1","target":"node-2","label":"relates to","type":"solid"}
  ]
}

Use 15-25 readable nodes. Source material:
${context.sourceText.slice(0, 16000)}`;

  const result = await trackedCompletion({
    job,
    phase: 'mindmap:completion',
    system: 'You are an expert knowledge visualization designer. Return strict JSON only.',
    prompt,
    responseFormat: 'json_object',
  });

  const parsed = parseJson(result.content);
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const edges = Array.isArray(parsed.edges) ? parsed.edges : [];
  if (nodes.length === 0) throw new Error('Mind map generation returned no nodes.');

  const mindmap = {
    id: crypto.randomUUID(),
    notebookId,
    title: `${context.title} - ${style} Mind Map`,
    centralTopic: typeof parsed.centralTopic === 'string' ? parsed.centralTopic : context.title,
    nodes,
    edges,
    metadata: {
      style,
      nodeCount: nodes.length,
      createdAt: new Date().toISOString(),
      customPrompt,
      sourceCount: context.sources.length,
    },
  };

  const assetId = await saveGeneratedAsset({
    notebookId,
    type: 'mindmap',
    title: mindmap.title,
    metadata: { mindmapData: mindmap },
  });

  return [{ phase: 'mindmap:saved', progressPct: 100, output: { assetId, nodeCount: nodes.length } }];
}
