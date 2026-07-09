const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const web3formsKey = Deno.env.get('WEB3FORMS_ACCESS_KEY');

    if (resendKey) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: body.from || Deno.env.get('EMAIL_FROM') || 'Memento <noreply@memento.app>',
          to: body.to,
          subject: body.subject,
          html: body.html,
          text: body.text,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || 'Resend request failed.');
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (web3formsKey) {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_key: web3formsKey, ...body }),
      });
      const data = await response.json();
      if (!response.ok || data.success === false) throw new Error(data?.message || 'Web3Forms request failed.');
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error('Email provider secret is not configured.');
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
