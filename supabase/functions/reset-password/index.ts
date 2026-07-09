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

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null

  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null

  return normalized
}

function normalizeCode(code: unknown): string | null {
  if (typeof code !== 'string') return null

  const normalized = code.trim()
  if (!/^\d{6}$/.test(normalized)) return null

  return normalized
}

function normalizePassword(password: unknown): string | null {
  if (typeof password !== 'string') return null
  if (password.length < 6 || password.length > 256) return null
  return password
}

async function hashCode(email: string, code: string): Promise<string> {
  const pepper = Deno.env.get('PASSWORD_RESET_PEPPER') ?? ''
  const input = new TextEncoder().encode(`${email}:${code}:${pepper}`)
  const digest = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await req.json().catch(() => ({}))
    const email = normalizeEmail(body.email)
    const code = normalizeCode(body.code)
    const newPassword = normalizePassword(body.newPassword)

    if (!email || !code || !newPassword) {
      return jsonResponse({ error: 'Invalid reset request.' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const codeHash = await hashCode(email, code)
    const { data, error } = await supabase.rpc('verify_and_consume_reset_code', {
      p_email: email,
      p_code_hash: codeHash,
    })

    if (error) throw error

    if (!data?.success || !data?.user_id) {
      return jsonResponse({ error: 'Invalid or expired reset code.' }, 400)
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(data.user_id, {
      password: newPassword,
    })

    if (updateError) throw updateError

    return jsonResponse({ success: true })
  } catch (error) {
    console.error('reset-password failed', error)
    return jsonResponse({ error: 'Could not reset password. Try again later.' }, 500)
  }
})
