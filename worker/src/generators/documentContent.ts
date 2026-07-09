import { createServiceClient } from '../lib/supabase.js';
import { JobRecord } from '../models.js';
import { trackedCompletion } from '../lib/usage.js';

interface SourceRow {
  title: string;
  content: string | null;
}

export interface NotebookContext {
  title: string;
  sources: SourceRow[];
  sourceText: string;
}

export async function loadNotebookContext(notebookId: string): Promise<NotebookContext> {
  const supabase = createServiceClient();

  const { data: notebook, error: notebookError } = await supabase
    .from('notebooks')
    .select('title')
    .eq('id', notebookId)
    .single();

  if (notebookError) throw notebookError;

  const { data: sources, error: sourcesError } = await supabase
    .from('sources')
    .select('title, content')
    .eq('notebook_id', notebookId);

  if (sourcesError) throw sourcesError;

  const usableSources = (sources || [])
    .filter((source): source is SourceRow => (
      typeof source.title === 'string'
      && typeof source.content === 'string'
      && source.content.trim().length > 0
    ));

  if (usableSources.length === 0) {
    throw new Error('No processed source content found for this notebook.');
  }

  const sourceText = usableSources
    .slice(0, 16)
    .map((source) => `# ${source.title}\n${source.content?.slice(0, 4000)}`)
    .join('\n\n');

  return {
    title: String(notebook?.title || 'Notebook'),
    sources: usableSources,
    sourceText,
  };
}

export async function generateMarkdownDocument(prompt: string, system: string, job?: JobRecord, phase = 'document:completion'): Promise<string> {
  if (!job) {
    throw new Error('Tracked document generation requires a job.');
  }

  const result = await trackedCompletion({
    job,
    phase,
    system,
    prompt,
    maxTokens: 8000,
  });
  return result.content;
}
