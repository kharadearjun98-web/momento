# Cloudflare Pages Deployment

## Fast Dashboard Setup

Create a Pages project from this GitHub repo.

| Setting | Value |
| --- | --- |
| Framework preset | Vite |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |
| Node.js version | `22` |

Cloudflare Pages will copy `public/_redirects` and `public/_headers` into `dist/` during `vite build`.
The build also runs `scripts/copy-landing.mjs`, which copies `landing/home` into `dist/landing/home`, preserves the React app shell at `dist/app/index.html`, and replaces `dist/index.html` with the landing page.

## Environment Variables

Set these in Cloudflare Pages > Project > Settings > Environment variables.

Required:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Optional, only if enabled in production:

```text
VITE_SENTRY_DSN
VITE_WEB3FORMS_KEY
VITE_OPENAI_API_KEY
VITE_NVIDIA_API_KEY
VITE_GOOGLE_API_KEY
LINGSHI_API_KEY
```

Do not put service-role Supabase keys in `VITE_*` vars. Vite exposes `VITE_*` values in browser JS.

## Domain

Add custom domain in Cloudflare Pages:

```text
app.memento.ai
```

If `memento.ai` DNS is already on Cloudflare, Pages can create the route automatically. Otherwise add CNAME:

```text
app -> memento.pages.dev
```

Use the exact Pages subdomain Cloudflare gives the project.

## Supabase Production URLs

Add these in Supabase Auth URL config:

```text
https://app.memento.ai
https://memento.pages.dev
```

Add callback URLs used by the app:

```text
https://app.memento.ai/auth/callback
https://memento.pages.dev/auth/callback
```

## CLI Deploy

Preview current build:

```bash
npm run build
npx wrangler pages deploy dist --project-name memento
```

Production deploy:

```bash
npm run deploy:cloudflare
```

## Current Cloudflare Files

- `wrangler.toml`: Pages project name and build output.
- `public/_redirects`: landing page rewrites for `/` and marketing slugs, then React Router fallback for app routes.
- `public/_headers`: security headers and immutable asset cache.
- `scripts/copy-landing.mjs`: includes `landing/home` static pages in the Pages build output and makes `/` serve the landing page.

## Routing

Landing pages:

```text
/ -> /index.html
/features.html -> /landing/home/features.html
/solutions.html -> /landing/home/solutions.html
/pricing.html -> /landing/home/pricing.html
/blog.html -> /landing/home/blog.html
/faq.html -> /landing/home/faq.html
/team.html -> /landing/home/team.html
/contact.html -> /landing/home/contact.html
/privacy.html -> /landing/home/privacy.html
/terms.html -> /landing/home/terms.html
```

Product routes use the React app shell at `/app/index.html`:

```text
/signin
/signup
/reset-password
/auth/callback
/notebooks
/new
/discover
/notebook/:id
```
