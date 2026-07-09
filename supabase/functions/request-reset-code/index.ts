import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const CODE_TTL_MINUTES = 10

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function normalizeEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null

  const normalized = email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null

  return normalized
}

function generateCode(): string {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return String(100000 + (values[0] % 900000))
}

async function hashCode(email: string, code: string): Promise<string> {
  const pepper = Deno.env.get('PASSWORD_RESET_PEPPER') ?? ''
  const input = new TextEncoder().encode(`${email}:${code}:${pepper}`)
  const digest = await crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function sendWithResend(email: string, code: string): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) return false

  const from = Deno.env.get('PASSWORD_RESET_EMAIL_FROM') ?? 'Memento <noreply@memento.local>'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: 'Your Memento password reset code',
      html: `<p>Your password reset code is:</p><p style="font-size: 28px; font-weight: 700; letter-spacing: 6px;">${code}</p><p>This code expires in ${CODE_TTL_MINUTES} minutes.</p><p>If you did not request this, you can ignore this email.</p>`,
      text: `Your Memento password reset code is: ${code}\n\nThis code expires in ${CODE_TTL_MINUTES} minutes.\n\nIf you did not request this, you can ignore this email.`,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Resend failed: ${response.status} ${detail}`)
  }

  return true
}

async function sendWithWeb3Forms(email: string, code: string): Promise<boolean> {
  const accessKey = Deno.env.get('WEB3FORMS_ACCESS_KEY')
  if (!accessKey) return false

  const response = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      access_key: accessKey,
      subject: 'Your Memento password reset code',
      from_name: 'Memento',
      to: email,
      message: `Your Memento password reset code is: ${code}\n\nThis code expires in ${CODE_TTL_MINUTES} minutes.\n\nIf you did not request this, you can ignore this email.`,
    }),
  })

  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.success) {
    throw new Error(`Web3Forms failed: ${response.status}`)
  }

  return true
}

async function sendResetEmail(email: string, code: string): Promise<void> {
  if (await sendWithResend(email, code)) return
  if (await sendWithWeb3Forms(email, code)) return

  throw new Error('No password reset email provider is configured')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const email = normalizeEmail((await req.json().catch(() => ({}))).email)
    if (!email) {
      return jsonResponse({ error: 'Enter a valid email address.' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    )

    const code = generateCode()
    const codeHash = await hashCode(email, code)
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString()
    const requestIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const userAgent = req.headers.get('user-agent')

    const { data, error } = await supabase.rpc('create_password_reset_code', {
      p_email: email,
      p_code_hash: codeHash,
      p_expires_at: expiresAt,
      p_request_ip: requestIp,
      p_user_agent: userAgent,
    })

    if (error) throw error

    if (data?.success === false && data?.error === 'rate_limited') {
      return jsonResponse({ error: 'Too many reset requests. Try again later.' }, 429)
    }

    if (data?.email_exists) {
      await sendResetEmail(email, code)
    }

    return jsonResponse({
      success: true,
      message: 'If an account exists for that email, a reset code has been sent.',
    })
  } catch (error) {
    console.error('request-reset-code failed', error)
    return jsonResponse({ error: 'Could not send a reset code. Try again later.' }, 500)
  }
})
