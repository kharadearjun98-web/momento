import { supabase } from './supabase/client';
import { GeneratedHandbook, GeneratedReport, HandbookFormat, HandbookLength, ReportFormat, ReportTone } from '../types';

interface HandbookRow {
  id: string;
  notebook_id: string;
  title: string;
  format: string | null;
  length: string | null;
  word_count: number | null;
  source_count: number | null;
  custom_prompt: string | null;
  model: string | null;
  created_at: string;
}

interface ReportRow {
  id: string;
  notebook_id: string;
  title: string;
  format: string | null;
  tone: string | null;
  word_count: number | null;
  source_count: number | null;
  custom_prompt: string | null;
  model: string | null;
  has_images: boolean | null;
  created_at: string;
}

interface SectionRow {
  id: string;
  title: string;
  content_markdown: string;
  level: number;
  order_index: number;
}

export interface RelationalContentSummary {
  id: string;
  kind: 'handbook' | 'report';
  notebookId: string;
  title: string;
  format?: string | null;
  length?: string | null;
  tone?: string | null;
  wordCount: number;
  sourceCount: number;
  createdAt: string;
}

export async function listRelationalContent(notebookId: string): Promise<RelationalContentSummary[]> {
  const [handbooksResult, reportsResult] = await Promise.all([
    supabase
      .from('handbooks')
      .select('id, notebook_id, title, format, length, word_count, source_count, created_at')
      .eq('notebook_id', notebookId)
      .order('created_at', { ascending: false }),
    supabase
      .from('reports')
      .select('id, notebook_id, title, format, tone, word_count, source_count, created_at')
      .eq('notebook_id', notebookId)
      .order('created_at', { ascending: false }),
  ]);

  if (handbooksResult.error) throw handbooksResult.error;
  if (reportsResult.error) throw reportsResult.error;

  const handbooks = ((handbooksResult.data || []) as HandbookRow[]).map((row) => ({
    id: row.id,
    kind: 'handbook' as const,
    notebookId: row.notebook_id,
    title: row.title,
    format: row.format,
    length: row.length,
    wordCount: row.word_count || 0,
    sourceCount: row.source_count || 0,
    createdAt: row.created_at,
  }));

  const reports = ((reportsResult.data || []) as ReportRow[]).map((row) => ({
    id: row.id,
    kind: 'report' as const,
    notebookId: row.notebook_id,
    title: row.title,
    format: row.format,
    tone: row.tone,
    wordCount: row.word_count || 0,
    sourceCount: row.source_count || 0,
    createdAt: row.created_at,
  }));

  return [...handbooks, ...reports].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function loadRelationalHandbook(handbookId: string): Promise<GeneratedHandbook> {
  const { data: handbook, error: handbookError } = await supabase
    .from('handbooks')
    .select('id, notebook_id, title, format, length, word_count, source_count, custom_prompt, model, created_at')
    .eq('id', handbookId)
    .single();

  if (handbookError) throw handbookError;

  const { data: sections, error: sectionsError } = await supabase
    .from('handbook_sections')
    .select('id, title, content_markdown, level, order_index')
    .eq('handbook_id', handbookId)
    .order('order_index', { ascending: true });

  if (sectionsError) throw sectionsError;

  const row = handbook as HandbookRow;
  const sectionRows = (sections || []) as SectionRow[];
  const mappedSections = sectionRows.map((section) => ({
    id: section.id,
    title: section.title,
    content: section.content_markdown,
    level: section.level,
  }));

  return {
    id: row.id,
    notebookId: row.notebook_id,
    title: row.title,
    content: mappedSections.map((section) => `${'#'.repeat(section.level)} ${section.title}\n\n${section.content}`).join('\n\n'),
    format: (row.format || 'Study Guide') as HandbookFormat,
    length: (row.length || '5 Pages') as HandbookLength,
    sections: mappedSections,
    tableOfContents: mappedSections.map((section) => ({
      id: section.id,
      title: section.title,
      level: section.level,
    })),
    metadata: {
      createdAt: row.created_at,
      wordCount: row.word_count || 0,
      pageEstimate: Math.ceil((row.word_count || 0) / 500),
      model: 'gpt-5.4-mini',
      sourceCount: row.source_count || 0,
      customPrompt: row.custom_prompt || undefined,
    },
  };
}

export async function loadRelationalReport(reportId: string): Promise<GeneratedReport> {
  const { data: report, error: reportError } = await supabase
    .from('reports')
    .select('id, notebook_id, title, format, tone, word_count, source_count, custom_prompt, model, has_images, created_at')
    .eq('id', reportId)
    .single();

  if (reportError) throw reportError;

  const { data: sections, error: sectionsError } = await supabase
    .from('report_sections')
    .select('id, title, content_markdown, level, order_index')
    .eq('report_id', reportId)
    .order('order_index', { ascending: true });

  if (sectionsError) throw sectionsError;

  const row = report as ReportRow;
  const mappedSections = ((sections || []) as SectionRow[]).map((section) => ({
    id: section.id,
    title: section.title,
    content: section.content_markdown,
    level: section.level,
  }));

  return {
    id: row.id,
    notebookId: row.notebook_id,
    title: row.title,
    content: mappedSections.map((section) => `${'#'.repeat(section.level)} ${section.title}\n\n${section.content}`).join('\n\n'),
    sections: mappedSections,
    images: [],
    metadata: {
      format: (row.format || 'Executive Summary') as ReportFormat,
      tone: (row.tone || 'Professional') as ReportTone,
      createdAt: row.created_at,
      customPrompt: row.custom_prompt || undefined,
      sourceCount: row.source_count || 0,
      wordCount: row.word_count || 0,
      model: row.model || undefined,
      hasImages: row.has_images || false,
    },
  };
}
