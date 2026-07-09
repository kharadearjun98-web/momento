import { pool } from '../lib/db.js';
import { JobRecord } from '../models.js';
import { MarkdownSection } from './markdown.js';

interface SaveHandbookInput {
  job: JobRecord;
  notebookId: string;
  title: string;
  format?: string;
  length?: string;
  wordCount: number;
  sourceCount: number;
  customPrompt?: string;
  model?: string;
  sections: MarkdownSection[];
}

interface SaveReportInput {
  job: JobRecord;
  notebookId: string;
  title: string;
  format?: string;
  tone?: string;
  wordCount: number;
  sourceCount: number;
  customPrompt?: string;
  model?: string;
  hasImages?: boolean;
  sections: MarkdownSection[];
}

export async function saveRelationalHandbook(input: SaveHandbookInput): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const handbook = await client.query<{ id: string }>(
      `
      INSERT INTO public.handbooks (
        notebook_id, user_id, title, format, length, word_count,
        source_count, custom_prompt, model
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
      `,
      [
        input.notebookId,
        input.job.user_id,
        input.title,
        input.format ?? null,
        input.length ?? null,
        input.wordCount,
        input.sourceCount,
        input.customPrompt ?? null,
        input.model ?? null,
      ],
    );

    const handbookId = handbook.rows[0].id;
    for (const section of input.sections) {
      await client.query(
        `
        INSERT INTO public.handbook_sections (
          handbook_id, level, title, content_markdown, order_index
        )
        VALUES ($1, $2, $3, $4, $5)
        `,
        [handbookId, section.level, section.title, section.content, section.orderIndex],
      );
    }

    await client.query('COMMIT');
    return handbookId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function saveRelationalReport(input: SaveReportInput): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const report = await client.query<{ id: string }>(
      `
      INSERT INTO public.reports (
        notebook_id, user_id, title, format, tone, word_count,
        source_count, custom_prompt, model, has_images
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
      `,
      [
        input.notebookId,
        input.job.user_id,
        input.title,
        input.format ?? null,
        input.tone ?? null,
        input.wordCount,
        input.sourceCount,
        input.customPrompt ?? null,
        input.model ?? null,
        input.hasImages ?? false,
      ],
    );

    const reportId = report.rows[0].id;
    for (const section of input.sections) {
      await client.query(
        `
        INSERT INTO public.report_sections (
          report_id, level, title, content_markdown, order_index
        )
        VALUES ($1, $2, $3, $4, $5)
        `,
        [reportId, section.level, section.title, section.content, section.orderIndex],
      );
    }

    await client.query('COMMIT');
    return reportId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
