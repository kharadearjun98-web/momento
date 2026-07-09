import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function parseJson(content: string): Record<string, unknown> {
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
  const first = cleaned.indexOf('{')
  const last = cleaned.lastIndexOf('}')
  if (first !== -1 && last > first) cleaned = cleaned.slice(first, last + 1)
  return JSON.parse(cleaned) as Record<string, unknown>
}

async function complete(system: string, prompt: string): Promise<string> {
  const lingshiKey = Deno.env.get('LINGSHI_API_KEY') || Deno.env.get('CHAT_API_KEY') || Deno.env.get('API_KEY')
  const openAiKey = Deno.env.get('OPENAI_API_KEY')
  const apiKey = lingshiKey || openAiKey
  if (!apiKey) throw new Error('Chat provider secret is not configured.')

  const configuredBaseUrl = Deno.env.get('LINGSHI_BASE_URL') || Deno.env.get('CHAT_BASE_URL') || Deno.env.get('OPENAI_BASE_URL') || Deno.env.get('BASE_URL')
  const baseUrl = configuredBaseUrl ? `${configuredBaseUrl.replace(/\/+$/, '')}/v1/chat/completions` : 'https://api.openai.com/v1/chat/completions'
  const models = (Deno.env.get('CHAT_MODELS') || '').split(',').map((model) => model.trim()).filter(Boolean)
  if (models.length === 0) models.push(lingshiKey || configuredBaseUrl ? 'gpt-5.4-mini' : 'gpt-4o-mini')

  let lastError = 'Chat provider request failed.'
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
        messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    })
    const data = await response.json()
    if (response.ok) return data?.choices?.[0]?.message?.content || ''
    lastError = data?.error?.message || lastError
  }
  throw new Error(lastError)
}

async function loadContext(serviceClient: ReturnType<typeof createClient>, notebookId: string) {
  const { data: notebook, error: notebookError } = await serviceClient
    .from('notebooks')
    .select('id,title,user_id')
    .eq('id', notebookId)
    .single()
  if (notebookError || !notebook) throw new Error('Notebook not found.')

  const { data: sources, error: sourcesError } = await serviceClient
    .from('sources')
    .select('title,content')
    .eq('notebook_id', notebookId)
    .not('content', 'is', null)
    .limit(8)
  if (sourcesError) throw sourcesError

  const sourceText = (sources || [])
    .filter((source: { content: string | null }) => source.content?.trim())
    .map((source: { title: string; content: string }) => `# ${source.title}\n${source.content.slice(0, 2500)}`)
    .join('\n\n---\n\n')
  if (!sourceText.trim()) throw new Error('No readable source content found for this notebook.')
  return { notebook, sourceText }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData.user) return jsonResponse({ error: 'Authentication required.' }, 401)

    const body = await req.json().catch(() => ({}))
    const notebookId = typeof body.notebookId === 'string' ? body.notebookId : ''
    const type = typeof body.type === 'string' ? body.type : 'Multiple Choice'
    const length = typeof body.length === 'string' ? body.length : '10 Questions'
    const difficulty = typeof body.difficulty === 'string' ? body.difficulty : 'Medium'
    const customPrompt = typeof body.customPrompt === 'string' ? body.customPrompt : undefined
    if (!notebookId) return jsonResponse({ error: 'notebookId is required.' }, 400)

    const serviceClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })
    const { notebook, sourceText } = await loadContext(serviceClient, notebookId)
    if (notebook.user_id !== userData.user.id) return jsonResponse({ error: 'Notebook not found.' }, 404)

    const count = Number.parseInt(length, 10) || 10
    const result = await complete(
      'You are an expert assessment designer. Return strict JSON only.',
      `Generate exactly ${count} ${difficulty} quiz questions for "${notebook.title}".
Question format: ${type}.
${customPrompt ? `Learning goals: ${customPrompt}` : ''}

Return JSON:
{"questions":[{"question":"Question text","type":"multiple-choice|true-false|short-answer","answers":[{"id":"a1","text":"Answer","isCorrect":true}],"correctAnswer":"a1","explanation":"Why this is correct","difficulty":"${difficulty}"}]}

Source material:
${sourceText.slice(0, 16000)}`,
    )

    const parsed = parseJson(result)
    const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : []
    if (rawQuestions.length === 0) throw new Error('Quiz generation returned no questions.')

    const quiz = {
      id: crypto.randomUUID(),
      notebookId,
      title: `${notebook.title} - ${difficulty} ${type} Quiz`,
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
    }

    const { data: asset, error: assetError } = await serviceClient
      .from('generated_assets')
      .insert({
        notebook_id: notebookId,
        type: 'quiz',
        title: quiz.title,
        metadata: { quizData: quiz },
      })
      .select('id')
      .single()
    if (assetError) throw assetError

    return jsonResponse({ assetId: asset.id, quiz })
  } catch (error) {
    console.error('generate-quiz failed', error)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Quiz generation failed.' }, 500)
  }
})
