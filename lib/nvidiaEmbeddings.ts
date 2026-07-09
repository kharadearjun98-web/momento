import { supabase } from './supabase/client';

const NVIDIA_MODEL = 'nvidia/nv-embedqa-e5-v5';
const EMBEDDING_DIMENSIONS = 1024;

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const { data, error } = await supabase.functions.invoke('embed', {
    body: { text: texts },
  });

  if (error) {
    throw new Error(`Embedding request failed: ${error.message}`);
  }

  if (!data?.embeddings || !Array.isArray(data.embeddings)) {
    throw new Error('Embedding response did not include embeddings.');
  }

  return data.embeddings;
}

export async function generateQueryEmbedding(query: string): Promise<number[]> {
  const embeddings = await generateEmbeddings([query]);
  return embeddings[0];
}

export async function generateDocumentEmbeddings(passages: string[]): Promise<number[][]> {
  return generateEmbeddings(passages);
}

export { EMBEDDING_DIMENSIONS, NVIDIA_MODEL };
