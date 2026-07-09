import { supabase } from './supabase/client';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatResponse {
  message: string;
  citations: string[];
  citationDetails?: Record<number, {
    sourceId: string;
    text: string;
    score: number;
  }>;
}

function extractCitations(message: string): string[] {
  return [...new Set(message.match(/\[(\d+)\]/g) || [])];
}

export async function streamChatResponse(
  messages: ChatMessage[],
  notebookId: string,
  onChunk: (chunk: string, fullText: string) => void
): Promise<ChatResponse> {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUserMessage) {
    throw new Error('No user message found');
  }

  const { data, error } = await supabase.functions.invoke('chat', {
    body: {
      notebookId,
      message: lastUserMessage.content,
      history: messages.slice(0, -1),
    },
  });

  if (error) {
    throw new Error(`Chat request failed: ${error.message}`);
  }

  const message = data?.message || data?.content || '';
  if (!message) {
    throw new Error('Chat response did not include a message.');
  }

  onChunk(message, message);

  return {
    message,
    citations: data?.citations || extractCitations(message),
    citationDetails: data?.citationDetails,
  };
}

export async function generateChatResponse(
  messages: ChatMessage[],
  notebookId: string
): Promise<ChatResponse> {
  let response: ChatResponse | null = null;
  response = await streamChatResponse(messages, notebookId, () => undefined);
  return response;
}

/**
 * Calls the chat function's generic completion mode with response_format forced
 * to json_object. Use this when you need the model to return strict JSON (e.g.
 * the notebook auto-summary), so the reasoning model can't reply with prose.
 * This path skips RAG retrieval — pass all needed content inside `messages`.
 */
export async function generateJsonCompletion(
  messages: ChatMessage[],
  options?: { maxTokens?: number }
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('chat', {
    body: {
      messages,
      response_format: { type: 'json_object' },
      max_tokens: options?.maxTokens ?? 1200,
    },
  });

  if (error) {
    throw new Error(`Analysis request failed: ${error.message}`);
  }

  const content =
    data?.message || data?.content || data?.choices?.[0]?.message?.content || '';
  if (!content) {
    throw new Error('Analysis response did not include content.');
  }

  return content;
}
