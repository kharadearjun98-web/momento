import { JobRecord, PhaseResult } from '../models.js';
import { loadNotebookContext, generateMarkdownDocument } from './documentContent.js';
import { countWords, extractTitle, parseMarkdownSections } from './markdown.js';
import { saveRelationalReport } from './contentPersistence.js';

function reportInstructions(format: string): string {
  if (format === 'Research Paper') {
    return 'Create an academic research paper with abstract, introduction, background/literature review, methodology, findings, discussion, conclusion, and references.';
  }
  if (format === 'Technical Memo') {
    return 'Create a technical memorandum with purpose, background, technical analysis, findings, risk assessment, recommendations, action items, and appendix.';
  }
  if (format === 'Literature Review') {
    return 'Create a literature review with abstract, introduction, background, thematic analysis, critical synthesis, gaps, implications, conclusion, and references.';
  }
  return 'Create an executive summary with executive overview, key findings, strategic implications, recommendations, next steps, and conclusion.';
}

export async function runReportJob(job: JobRecord, completedPhases: Set<string>): Promise<PhaseResult[]> {
  if (completedPhases.has('report:saved')) {
    return [];
  }

  const input = job.input_jsonb;
  const notebookId = String(input.notebookId || '');
  if (!notebookId) {
    throw new Error('Report jobs require input.notebookId.');
  }

  const context = await loadNotebookContext(notebookId);
  const format = typeof input.format === 'string' ? input.format : 'Executive Summary';
  const tone = typeof input.tone === 'string' ? input.tone : 'Professional';
  const customPrompt = typeof input.customPrompt === 'string' ? input.customPrompt : undefined;

  const prompt = `Create a ${format} for "${context.title}".

Tone: ${tone}.
${customPrompt ? `Special directives: ${customPrompt}` : ''}

Report requirements:
${reportInstructions(format)}

Use Markdown only:
- Start with one # title.
- Use ## and ### sections.
- Include specific evidence and source synthesis.
- Do not include JSON, frontmatter, generation notes, or placeholders.

Source material:
${context.sourceText.slice(0, 26000)}`;

  const markdown = await generateMarkdownDocument(
    prompt,
    'You are an expert research analyst. Produce clear, source-grounded reports with specific analysis.',
    job,
    'report:completion',
  );

  const title = extractTitle(markdown, `${format}: ${context.title}`);
  const sections = parseMarkdownSections(markdown);
  const wordCount = countWords(markdown);
  const reportId = await saveRelationalReport({
    job,
    notebookId,
    title,
    format,
    tone,
    wordCount,
    sourceCount: context.sources.length,
    customPrompt,
    model: process.env.LINGSHI_DOCUMENT_MODEL || process.env.OPENAI_DOCUMENT_MODEL || 'document-worker',
    hasImages: false,
    sections,
  });

  return [
    {
      phase: 'report:saved',
      progressPct: 100,
      output: {
        reportId,
        title,
        wordCount,
        sectionCount: sections.length,
      },
    },
  ];
}
