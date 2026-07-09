import { closePool } from './lib/db.js';
import { claimNextJob, reapStuckJobs, runJob } from './jobs/dispatcher.js';
import { initSentry, Sentry } from './lib/sentry.js';

const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS ?? 2000);
const reapIntervalMs = Number(process.env.STUCK_JOB_REAP_INTERVAL_MS ?? 60000);
let shuttingDown = false;
let lastReapAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Periodically reclaim jobs left 'running' by a crashed worker. Runs on its own
// slower cadence so we don't hammer the database on every fast poll tick.
async function maybeReapStuckJobs() {
  const now = Date.now();
  if (now - lastReapAt < reapIntervalMs) {
    return;
  }
  lastReapAt = now;

  try {
    const reaped = await reapStuckJobs();
    if (reaped > 0) {
      console.warn(`reaper reclaimed ${reaped} stuck job(s)`);
    }
  } catch (error) {
    Sentry.captureException(error);
    console.error('reaper failed', error);
  }
}

async function tick() {
  await maybeReapStuckJobs();

  const job = await claimNextJob();
  if (!job) {
    await sleep(pollIntervalMs);
    return;
  }

  console.log('claimed job', { id: job.id, type: job.type, attempt: job.attempts });
  await runJob(job);
}

async function main() {
  initSentry();

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }

  console.log('memento worker started');
  while (!shuttingDown) {
    try {
      await tick();
    } catch (error) {
      Sentry.captureException(error);
      console.error('worker tick failed', error);
      await sleep(pollIntervalMs);
    }
  }
}

process.on('SIGINT', async () => {
  shuttingDown = true;
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  shuttingDown = true;
  await closePool();
  process.exit(0);
});

main().catch(async (error) => {
  Sentry.captureException(error);
  console.error('worker fatal error', error);
  await closePool();
  process.exit(1);
});
