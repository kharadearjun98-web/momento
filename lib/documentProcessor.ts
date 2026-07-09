import { generateDocumentEmbeddings } from './nvidiaEmbeddings';
import { supabase } from './supabase/client';
import { extractAndStoreGraph } from './lightrag';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';

// Types
export interface ProcessedDocument {
  sourceId: string;
  chunks: DocumentChunk[];
  totalTokens: number;
}

export interface DocumentChunk {
  content: string;
  embedding: number[];
  metadata: {
    page?: number;
    chunkIndex: number;
    sourceId: string;
  };
}

/**
 * Extract text from PDF file
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  // Dynamic import of pdfjs-dist
  const pdfjsLib = await import('pdfjs-dist');

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';

  // Extract text from each page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += `\n--- Page ${i} ---\n${pageText}`;
  }

  return fullText.trim();
}

/**
 * Split text into chunks for processing
 */
export function chunkText(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 200
): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }

  return chunks;
}

/**
 * Generate embeddings for text chunks using NVIDIA nv-embedqa-e5-v5 (1024 dimensions)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // Use NVIDIA nv-embedqa-e5-v5 for document embeddings
  return generateDocumentEmbeddings(texts);
}

/**
 * Process a document: extract text, chunk it, and generate embeddings
 */
export async function processDocument(
  file: File,
  sourceId: string
): Promise<ProcessedDocument> {
  try {
    // Extract text based on file type
    let text = '';

    if (file.type === 'application/pdf') {
      text = await extractTextFromPDF(file);
    } else if (file.type === 'text/plain') {
      text = await file.text();
    } else {
      throw new Error(`Unsupported file type: ${file.type}`);
    }

    // Chunk the text
    const textChunks = chunkText(text);

    // Generate embeddings
    const embeddings = await generateEmbeddings(textChunks);

    // Create document chunks
    const chunks: DocumentChunk[] = textChunks.map((content, index) => ({
      content,
      embedding: embeddings[index],
      metadata: {
        chunkIndex: index,
        sourceId,
      },
    }));

    return {
      sourceId,
      chunks,
      totalTokens: text.length / 4, // Rough estimate
    };
  } catch (error) {
    console.error('Error processing document:', error);
    throw error;
  }
}

/**
 * Store document chunks in Supabase and extract knowledge graph
 */
export async function storeDocumentChunks(
  chunks: DocumentChunk[],
  notebookId?: string,
  onProgress?: (message: string) => void
): Promise<void> {
  try {
    const data = chunks.map(chunk => ({
      source_id: chunk.metadata.sourceId,
      content: chunk.content,
      embedding: chunk.embedding,
      metadata: chunk.metadata,
    }));

    const { error } = await supabase
      .from('document_chunks')
      .insert(data);

    if (error) throw error;

    // Extract knowledge graph if notebook ID is provided
    if (notebookId && chunks.length > 0) {
      const sourceId = chunks[0].metadata.sourceId;
      const chunkContents = chunks.map(c => c.content);

      // Run graph extraction (non-blocking, errors won't fail the upload)
      await extractAndStoreGraph(sourceId, notebookId, chunkContents, onProgress);
    }
  } catch (error) {
    console.error('Error storing document chunks:', error);
    throw error;
  }
}

/**
 * Search for similar document chunks using vector similarity
 */
export async function searchSimilarChunks(
  query: string,
  notebookId: string,
  limit: number = 5
): Promise<any[]> {
  try {
    // Generate embedding for query
    const queryEmbedding = await generateEmbeddings([query]);

    // Search for similar chunks
    const { data, error } = await supabase.rpc('match_document_chunks', {
      query_embedding: queryEmbedding[0],
      match_threshold: 0.7,
      match_count: limit,
      notebook_id: notebookId,
    });

    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Error searching similar chunks:', error);
    throw error;
  }
}

/**
 * Upload file to Supabase Storage
 */
export async function uploadToStorage(
  file: File,
  bucket: string,
  path: string
): Promise<string> {
  try {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (error) throw error;

    return data.path;
  } catch (error) {
    console.error('Error uploading to storage:', error);
    throw error;
  }
}

/**
 * Get public URL from Supabase Storage
 */
export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return data.publicUrl;
}
