import { execFileSync } from 'node:child_process';

const image = process.env.MEMENTO_IMAGE_TAG || 'memento-embedding-smoke:local';

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const output = run('docker', [
  'run',
  '--rm',
  '--entrypoint',
  'sh',
  image,
  '-c',
  "grep -R -E \"localhost:5173|/nvidia-api\" /usr/share/nginx/html 2>/dev/null || true",
]).trim();

if (output) {
  console.error('Production bundle still contains the old NVIDIA dev proxy path:');
  console.error(output);
  process.exit(1);
}

console.log('Production embedding smoke check passed: no localhost NVIDIA proxy references in built assets.');

const supabaseUrl = process.env.MEMENTO_SUPABASE_URL;
const supabaseAnonKey = process.env.MEMENTO_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.log('Skipping live embed function smoke test: MEMENTO_SUPABASE_URL or MEMENTO_SUPABASE_ANON_KEY is not set.');
  process.exit(0);
}

if (supabaseAnonKey.split('.').length !== 3) {
  console.log('Skipping live embed function smoke test: MEMENTO_SUPABASE_ANON_KEY is not a JWT-shaped legacy anon key.');
  console.log('Set a legacy anon JWT for this smoke test if the Edge Function has JWT verification enabled.');
  process.exit(0);
}

const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/embed`, {
  method: 'POST',
  headers: {
    apikey: supabaseAnonKey,
    authorization: `Bearer ${supabaseAnonKey}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ text: ['production embedding smoke test'] }),
});

const data = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error('Live embed function smoke test failed:');
  console.error(data);
  process.exit(1);
}

const vector = data?.embeddings?.[0];
if (!Array.isArray(vector) || vector.length !== 1024 || vector.some((value) => typeof value !== 'number')) {
  console.error('Live embed function returned an invalid vector shape.');
  console.error({ length: Array.isArray(vector) ? vector.length : null });
  process.exit(1);
}

console.log('Live embed function smoke check passed: received a 1024-dimensional embedding vector.');
