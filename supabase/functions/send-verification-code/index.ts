// Supabase Edge Function to send verification code email
// Deploy this to Supabase: supabase functions deploy send-verification-code

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') // You can use Resend, SendGrid, or any email service

serve(async (req) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    const { email, code } = await req.json()

    // Send email using Resend (or your preferred service)
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Memento <noreply@yourdomain.com>', // Replace with your domain
        to: email,
        subject: 'Your Memento Password Reset Code',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .header h1 { color: white; margin: 0; font-size: 24px; }
                .content { background: white; padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px; }
                .code-box { background: #f3f4f6; border: 2px solid #8B5CF6; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0; }
                .code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #8B5CF6; font-family: monospace; }
                .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🔐 Password Reset Request</h1>
                </div>
                <div class="content">
                  <p>Hello,</p>
                  <p>You requested to reset your password for your Memento account. Use the verification code below to proceed:</p>
                  
                  <div class="code-box">
                    <div class="code">${code}</div>
                  </div>
                  
                  <p><strong>This code will expire in 10 minutes.</strong></p>
                  
                  <p>If you didn't request this password reset, please ignore this email or contact support if you have concerns.</p>
                  
                  <div class="footer">
                    <p>This is an automated message from Memento. Please do not reply to this email.</p>
                  </div>
                </div>
              </div>
            </body>
          </html>
        `,
      }),
    })

    if (!emailResponse.ok) {
      throw new Error('Failed to send email')
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers, status: 200 }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers, status: 500 }
    )
  }
})
