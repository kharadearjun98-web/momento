# Deployment Guide

## Prerequisites

- GitHub account with access to this repository
- Docker Hub repository
- Supabase project (managed backend)

## Environment Variables

This is a frontend-only application. All environment variables are embedded at build time.

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL (e.g., `https://xxxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (found in Project Settings → API) |
| `VITE_WEB3FORMS_KEY` | No | For password reset emails |
| `VITE_OPENAI_API_KEY` | No | For chat completions and TTS |
| `VITE_NVIDIA_API_KEY` | No | For NVIDIA NIM embeddings (nv-embedqa-e5-v5) |
| `VITE_GOOGLE_API_KEY` | No | Alternative to OpenAI |
| `LINGSHI_API_KEY` | No | Lingshi chat provider key (Supabase secret) |

### Getting Supabase Credentials

1. Go to [supabase.com](https://supabase.com) and select your project
2. Go to **Project Settings** → **API**
3. Copy the **Project URL** and **anon public** key

## GitHub Setup

### 1. Add Secrets

1. Navigate to your GitHub repository
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add each variable from the table above

### 2. Push to Trigger Build

```bash
git push origin jim-memento
```

This triggers the GitHub Actions workflow which:
- Builds the Docker image
- Pushes to GitHub Container Registry

## Local Server Deployment

### 1. Pull the Image

```bash
docker pull docker.io/jimamuto/memento:latest
```

### 2. Run the Container

```bash
docker run -d -p 80:80 docker.io/jimamuto/memento:latest
```

### 3. Update Without Downtime

```bash
# Pull latest
docker pull docker.io/jimamuto/memento:latest

# Stop and remove old container
docker stop memento && docker rm memento

# Start new container
docker run -d -p 80:80 --name memento docker.io/jimamuto/memento:latest
```

### 4. Using Docker Compose (Recommended)

Create `docker-compose.yml` on your local server:

```yaml
version: '3.8'

services:
  memento:
    image: docker.io/jimamuto/memento:latest
    container_name: memento
    restart: unless-stopped
    ports:
      - "80:80"
```

Run with:
```bash
docker-compose up -d
```

Update with:
```bash
docker-compose pull
docker-compose up -d
```

## Network Considerations

Since this is a frontend-only app with Supabase as the backend:

- **Public Supabase**: If your Supabase project has a public URL, the app will work out of the box
- **Private Supabase**: You'll need a VPN or tunnel (e.g., Cloudflare Tunnel, Tailscale) to access it from your local server

## Troubleshooting

### Container Won't Start

Check logs:
```bash
docker logs memento
```

### Can't Connect to Supabase

Verify the Supabase URL is correct and publicly accessible:
```bash
curl https://your-supabase-url/rest/v1/
```

### Rebuild with New Variables

Simply push to `jim-memento` branch with updated secrets:
```bash
git add .
git commit -m "Update env vars"
git push origin jim-memento
```
