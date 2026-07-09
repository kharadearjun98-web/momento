import { JobRecord, PhaseResult } from '../models.js';
import { loadNotebookContext, generateMarkdownDocument } from './documentContent.js';
import { countWords, extractTitle, parseMarkdownSections } from './markdown.js';
import { saveRelationalHandbook } from './contentPersistence.js';

function targetWords(length: unknown): number {
  if (length === '15 Pages') return 7500;
  if (length === '30+ Pages') return 15000;
  return 2500;
}

function formatInstructions(format: unknown): string {
  if (format === 'Cheatsheet') {
    return 'Create a dense quick-reference cheatsheet with compact tables, definitions, formulas, rules, examples, and common mistakes.';
  }
  if (format === 'Briefing') {
    return 'Create an executive briefing with an executive summary, background, key points, critical analysis, recommendations, and appendix.';
  }
  if (format === 'Comprehensive') {
    return 'Create a comprehensive handbook with front matter, foundations, core chapters, advanced topics, practical applications, review material, glossary, and appendices.';
  }
  return 'Create a structured study guide with learning objectives, core concepts, main chapters, worked examples, misconceptions, practice questions, and summaries.';
}

export async function runHandbookJob(job: JobRecord, completedPhases: Set<string>): Promise<PhaseResult[]> {
  if (completedPhases.has('handbook:saved')) {
    return [];
  }

  const input = job.input_jsonb;
  const notebookId = String(input.notebookId || '');
  if (!notebookId) {
    throw new Error('Handbook jobs require input.notebookId.');
  }

  const context = await loadNotebookContext(notebookId);
  const format = typeof input.format === 'string' ? input.format : 'Study Guide';
  const length = typeof input.length === 'string' ? input.length : '5 Pages';
  const customPrompt = typeof input.customPrompt === 'string' ? input.customPrompt : undefined;
  const words = targetWords(length);

  const prompt = `Create a publication-quality ${format} for "${context.title}".

Target length: about ${words} words.
${customPrompt ? `Special focus: ${customPrompt}` : ''}

Format requirements:
${formatInstructions(format)}

Use Markdown only:
- Start with one # title.
- Use ## and ### sections.
- Do not include JSON, frontmatter, generation notes, or placeholders.
- Every section must have real content from the sources.

Source material:
${context.sourceText.slice(0, 30000)}`;

  const markdown = await generateMarkdownDocument(
    prompt,
    'You are an expert educator and technical writer. Produce complete, useful handbooks from source material.',
    job,
    'handbook:completion',
  );

  const title = extractTitle(markdown, `${format}: ${context.title}`);
  const sections = parseMarkdownSections(markdown);
  const wordCount = countWords(markdown);
  const handbookId = await saveRelationalHandbook({
    job,
    notebookId,
    title,
    format,
    length,
    wordCount,
    sourceCount: context.sources.length,
    customPrompt,
    model: process.env.LINGSHI_DOCUMENT_MODEL || process.env.OPENAI_DOCUMENT_MODEL || 'document-worker',
    sections,
  });

  return [
    {
      phase: 'handbook:saved',
      progressPct: 100,
      output: {
        handbookId,
        title,
        wordCount,
        sectionCount: sections.length,
      },
    },
  ];
}
