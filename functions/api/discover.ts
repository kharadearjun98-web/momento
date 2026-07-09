interface FirecrawlSearchResult {
  title?: string;
  description?: string;
  url?: string;
  markdown?: string;
  metadata?: {
    title?: string;
    description?: string;
    sourceURL?: string;
    url?: string;
  };
}

interface Env {
  FIRECRAWL_API_KEY?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.trim();
  const requestedNum = Number(url.searchParams.get('num') || '8');
  const limit = Number.isFinite(requestedNum) ? Math.min(Math.max(requestedNum, 1), 10) : 8;

  if (!query) {
    return Response.json({ error: 'Missing query parameter: q' }, { status: 400 });
  }

  if (!env.FIRECRAWL_API_KEY) {
    return Response.json({ error: 'FIRECRAWL_API_KEY is not configured' }, { status: 500 });
  }

  const response = await fetch('https://api.firecrawl.dev/v2/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      limit,
      sources: ['web'],
      scrapeOptions: {
        formats: [{ type: 'markdown' }],
        onlyMainContent: true,
      },
    }),
  });

  const data = await response.json();

  if (!response.ok || data.success === false) {
    return Response.json(
      { error: 'Firecrawl request failed', status: response.status, details: data },
      { status: response.status },
    );
  }

  const firecrawlResults: FirecrawlSearchResult[] = Array.isArray(data.data?.web)
    ? data.data.web
    : Array.isArray(data.data)
      ? data.data
      : [];

  const results = firecrawlResults.map((item, index) => {
    const link = item.url || item.metadata?.sourceURL || item.metadata?.url || '';
    const source = link ? new URL(link).hostname : 'Unknown source';

    return {
      position: index + 1,
      title: item.title || item.metadata?.title || 'Untitled result',
      link,
      snippet: item.description || item.metadata?.description || item.markdown?.slice(0, 240) || '',
      source,
      date: 'Recent',
      relevancy: Math.max(60, Math.floor(99 - index * 4)),
      content: item.markdown || item.description || item.metadata?.description || '',
    };
  });

  return Response.json({ results });
};
