import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChunkResult {
  id: string
  content: string
  similarity: number
  source_id?: string
}

interface ContextChunk {
  id: string
  content: string
  source_id?: string
  score: number
  kind: 'semantic' | 'overview' | 'source'
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function normalizeMessages(history: unknown): ChatMessage[] {
  if (!Array.isArray(history)) return []
  return history
    .filter((item) => item && typeof item === 'object')
    .map((item) => item as Record<string, unknown>)
    .filter((item) => (item.role === 'user' || item.role === 'assistant' || item.role === 'system') && typeof item.content === 'string')
    .slice(-12) as ChatMessage[]
}

async function generateEmbedding(input: string): Promise<number[]> {
  const apiKey = Deno.env.get('NVIDIA_API_KEY')
  if (!apiKey) throw new Error('NVIDIA embedding secret is not configured.')

  const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: [input],
      model: Deno.env.get('NVIDIA_EMBEDDING_MODEL') || 'nvidia/nv-embedqa-e5-v5',
      input_type: 'query',
      encoding_format: 'float',
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Embedding provider request failed.')
  }

  const embedding = data?.data?.[0]?.embedding
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding provider returned an invalid response.')
  }

  return embedding
}

async function retrieveSemanticChunks(
  serviceClient: ReturnType<typeof createClient>,
  notebookId: string,
  query: string,
): Promise<ContextChunk[]> {
  try {
    const queryEmbedding = await generateEmbedding(query)

    const { data, error } = await serviceClient.rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.35,
      match_count: 8,
      notebook_id: notebookId,
    })

    if (error) {
      console.warn('match_document_chunks failed', error)
      return []
    }

    return ((data || []) as ChunkResult[]).map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      source_id: chunk.source_id,
      score: chunk.similarity ?? 0,
      kind: 'semantic' as const,
    }))
  } catch (error) {
    console.warn('semantic retrieval failed', error)
    return []
  }
}

async function retrieveOverviewChunks(
  serviceClient: ReturnType<typeof createClient>,
  notebookId: string,
): Promise<ContextChunk[]> {
  const { data, error } = await serviceClient
    .from('document_chunks')
    .select('id, content, source_id, chunk_index, sources!inner(notebook_id)')
    .eq('sources.notebook_id', notebookId)
    .order('chunk_index', { ascending: true })
    .limit(12)

  if (error) {
    console.warn('overview chunk retrieval failed', error)
    return []
  }

  return ((data || []) as Array<{ id: string; content: string; source_id?: string }>).map((chunk) => ({
    id: chunk.id,
    content: chunk.content,
    source_id: chunk.source_id,
    score: 0,
    kind: 'overview' as const,
  }))
}

async function retrieveSourceContentFallback(
  serviceClient: ReturnType<typeof createClient>,
  notebookId: string,
): Promise<ContextChunk[]> {
  const { data, error } = await serviceClient
    .from('sources')
    .select('id, title, content')
    .eq('notebook_id', notebookId)
    .not('content', 'is', null)
    .limit(4)

  if (error) {
    console.warn('source content fallback failed', error)
    return []
  }

  return ((data || []) as Array<{ id: string; title: string; content: string | null }>).flatMap((source) => {
    const content = source.content?.trim()
    if (!content) return []

    return [{
      id: `source-${source.id}`,
      source_id: source.id,
      content: `Source: ${source.title}\n${content.slice(0, 3000)}`,
      score: 0,
      kind: 'source' as const,
    }]
  })
}

function mergeContextChunks(chunks: ContextChunk[], maxChars = 14000): ContextChunk[] {
  const seen = new Set<string>()
  const merged: ContextChunk[] = []
  let totalChars = 0

  for (const chunk of chunks) {
    const key = chunk.id || `${chunk.source_id || 'unknown'}:${chunk.content.slice(0, 120)}`
    if (seen.has(key)) continue
    seen.add(key)

    const nextTotal = totalChars + chunk.content.length
    if (nextTotal > maxChars && merged.length > 0) break

    merged.push(chunk)
    totalChars = nextTotal
  }

  return merged
}

async function retrieveContext(serviceClient: ReturnType<typeof createClient>, notebookId: string, query: string) {
  const citationDetails: Record<number, { sourceId: string; text: string; score: number }> = {}

  const [semanticChunks, overviewChunks] = await Promise.all([
    retrieveSemanticChunks(serviceClient, notebookId, query),
    retrieveOverviewChunks(serviceClient, notebookId),
  ])

  let chunks = mergeContextChunks([...semanticChunks, ...overviewChunks])

  if (chunks.length === 0) {
    chunks = mergeContextChunks(await retrieveSourceContentFallback(serviceClient, notebookId))
  }

  const formattedContext = chunks.length > 0
    ? chunks.map((chunk, index) => {
      if (chunk.source_id) {
        citationDetails[index + 1] = {
          sourceId: chunk.source_id,
          text: chunk.content,
          score: chunk.score,
        }
      }
      return `[${index + 1}] ${chunk.content}`
    }).join('\n\n')
    : 'No readable source text or document chunks were found for this notebook.'

  return { formattedContext, citationDetails }
}

function buildSystemMessage(context: string): ChatMessage {
  return {
    role: 'system',
    content: `You are an AI learning assistant helping users understand their study materials. Use the following document context to answer the user's question.\n\n${context}\n\nResponse rules:\n- Treat phrases like "my PDF", "this document", "the upload", "the file", and "it" as references to the current notebook sources.\n- Be clear, structured, and educational.\n- Use markdown headings and bullets when useful.\n- Cite document-backed claims with [1], [2], etc.\n- If the context is insufficient, say what is missing instead of inventing facts.`,
  }
}

async function complete(
  messages: ChatMessage[],
  options?: { maxTokens?: number; responseFormat?: 'json_object' },
): Promise<string> {
  const lingshiKey = Deno.env.get('LINGSHI_API_KEY') || Deno.env.get('CHAT_API_KEY') || Deno.env.get('API_KEY')
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  const apiKey = lingshiKey || openAiKey

  const configuredBaseUrl =
    Deno.env.get('LINGSHI_BASE_URL') ||
    Deno.env.get('CHAT_BASE_URL') ||
    Deno.env.get('OPENAI_BASE_URL') ||
    Deno.env.get('BASE_URL')
  const baseUrl = configuredBaseUrl
    ? `${configuredBaseUrl.replace(/\/+$/, '').replace(/\/v1$/, '')}/v1/chat/completions`
    : 'https://api.openai.com/v1/chat/completions'

  if (!apiKey) throw new Error('Chat provider secret is not configured.')

  const models = (Deno.env.get('CHAT_MODELS') || '')
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean)

  if (models.length === 0) {
    if (lingshiKey || configuredBaseUrl) {
      models.push('gpt-5.4-mini', 'gpt-5.4-low', 'gpt-5.4')
    } else {
      models.push('gpt-4o-mini')
    }
  }

  let lastError: unknown = null

  for (const model of models) {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('APP_ORIGIN') || 'https://memento.app',
        'X-Title': 'Memento AI',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: options?.maxTokens ?? 1000,
        ...(options?.responseFormat ? { response_format: { type: options.responseFormat } } : {}),
      }),
    })

    const data = await response.json()
    if (response.ok) {
      const content = data?.choices?.[0]?.message?.content || ''
      // Reasoning models emit <think>...</think> before the answer; strip it.
      return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    }

    lastError = data?.error?.message || `Chat provider request failed for ${model}.`
  }

  throw new Error(String(lastError || 'Chat provider request failed.'))
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      },
    )

    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Authentication required.' }, 401)
    }

    const body = await req.json().catch(() => ({}))

    // Generic completion mode: callers (e.g. graph extraction via serverOnlyProvider)
    // send an OpenAI-style { messages: [...] } payload with no notebookId. Run the
    // completion directly and return an OpenAI-shaped response.
    if (Array.isArray(body.messages) && !body.notebookId) {
      const genericMessages = normalizeMessages(body.messages)
      if (genericMessages.length === 0) {
        return jsonResponse({ error: 'messages are required.' }, 400)
      }
      const responseFormat = body?.response_format?.type === 'json_object' ? 'json_object' : undefined
      const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : undefined
      const content = await complete(genericMessages, { maxTokens, responseFormat })
      return jsonResponse({
        choices: [{ message: { role: 'assistant', content } }],
        message: content,
        content,
      })
    }

    const notebookId = typeof body.notebookId === 'string' ? body.notebookId : null
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const history = normalizeMessages(body.history)

    if (!notebookId || !message) {
      return jsonResponse({ error: 'notebookId and message are required.' }, 400)
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const { data: notebook, error: notebookError } = await serviceClient
      .from('notebooks')
      .select('id,user_id')
      .eq('id', notebookId)
      .single()

    if (notebookError || notebook?.user_id !== userData.user.id) {
      return jsonResponse({ error: 'Notebook not found.' }, 404)
    }

    const { formattedContext, citationDetails } = await retrieveContext(serviceClient, notebookId, message)
    const responseMessage = await complete([
      buildSystemMessage(formattedContext),
      ...history,
      { role: 'user', content: message },
    ])

    const citations = [...new Set(responseMessage.match(/\[(\d+)\]/g) || [])]

    return jsonResponse({
      message: responseMessage,
      content: responseMessage,
      citations,
      citationDetails,
    })
  } catch (error) {
    console.error('chat failed', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Chat request failed.' }, 500)
  }
})
