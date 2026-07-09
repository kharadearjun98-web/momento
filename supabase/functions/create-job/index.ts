import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const allowedTypes = new Set([
  'handbook',
  'report',
  'quiz',
  'flashcards',
  'mindmap',
  'podcast',
  'audio',
  'video',
])

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function normalizeJobType(type: unknown): string | null {
  if (typeof type !== 'string') return null
  const normalized = type.trim().toLowerCase()
  return allowedTypes.has(normalized) ? normalized : null
}

function normalizeInput(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return input as Record<string, unknown>
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
    const type = normalizeJobType(body.type)
    const input = normalizeInput(body.input)

    if (!type || !input) {
      return jsonResponse({ error: 'Invalid job request.' }, 400)
    }

    if (
      (type === 'handbook' || type === 'report' || type === 'quiz' || type === 'flashcards' || type === 'mindmap' || type === 'video')
      && typeof input.notebookId !== 'string'
    ) {
      return jsonResponse({ error: `${type} jobs require input.notebookId.` }, 400)
    }

    // TODO(P3 credits): check user credit/quota balance before inserting the job.
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const { data, error } = await serviceClient
      .from('jobs')
      .insert({
        user_id: userData.user.id,
        type,
        input_jsonb: input,
        status: 'queued',
        phase: 'queued',
        progress_pct: 0,
      })
      .select('id')
      .single()

    if (error) throw error

    return jsonResponse({ jobId: data.id })
  } catch (error) {
    console.error('create-job failed', error)
    return jsonResponse({ error: 'Could not create job.' }, 500)
  }
})
