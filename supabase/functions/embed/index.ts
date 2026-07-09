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
    const apiKey = Deno.env.get('NVIDIA_API_KEY');
    if (!apiKey) {
      throw new Error('NVIDIA embedding secret is not configured.');
    }

    const input = body.text || body.texts || body.input || [];
    if (!Array.isArray(input) || input.length === 0 || input.some((item) => typeof item !== 'string')) {
      throw new Error('Request body must include text as a non-empty string array.');
    }

    const response = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input,
        model: body.model || 'nvidia/nv-embedqa-e5-v5',
        input_type: body.input_type || 'passage',
        encoding_format: 'float',
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error?.message || 'Embedding provider request failed.');
    }

    const embeddings = Array.isArray(data.data) ? data.data.map((item: { embedding: number[] }) => item.embedding) : [];
    return new Response(JSON.stringify({ ...data, embeddings }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
