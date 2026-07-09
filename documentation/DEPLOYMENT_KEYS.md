# Deployment Keys

This file tracks credentials needed for Memento deployment. Do not commit actual secret values.

## Cloudflare Pages

### `memento-app`

Set in Cloudflare Pages > `memento-app` > Settings > Environment variables.

Already set:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Optional:

```text
VITE_SENTRY_DSN
```

Required for Discover web search:

```text
FIRECRAWL_API_KEY
```

Set `FIRECRAWL_API_KEY` in both Production and Preview. Use Cloudflare's encrypted/secret variable type when available. After changing it, redeploy `memento-app` so `functions/api/discover.ts` receives the new value.

### `memento-landing`

No runtime credentials required. It serves static files from `landing/home`.

## Supabase Edge Functions

Set these as Supabase function secrets.

Required for full operation:

```text
OPENAI_API_KEY
NVIDIA_API_KEY
RESEND_API_KEY
WEB3FORMS_ACCESS_KEY
PASSWORD_RESET_PEPPER
PASSWORD_RESET_EMAIL_FROM
EMAIL_FROM
APP_ORIGIN
```

Supabase platform secrets are also required, but are intentionally omitted here because they are managed separately:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## Worker Package

Set these if deploying the `worker/` package.

Required:

```text
DATABASE_URL
OPENAI_API_KEY
```

Optional:

```text
OPENAI_DOCUMENT_MODEL
OPENAI_AUDIO_MODEL
APP_ORIGIN
SENTRY_DSN
SENTRY_ENVIRONMENT
SENTRY_TRACES_SAMPLE_RATE
WORKER_POLL_INTERVAL_MS
DATABASE_SSL
```

## Security Notes

- Do not put provider secrets in `VITE_*` variables. Vite exposes them in browser JavaScript.
- Firecrawl lookup is handled by `functions/api/discover.ts`; keep `FIRECRAWL_API_KEY` server-side only.
- OpenRouter is not part of the production target going forward. Use the OpenAI-compatible `OPENAI_API_KEY` and `OPENAI_BASE_URL` provider instead.
- Revoke any Cloudflare API tokens pasted into chat or terminal history after use.
