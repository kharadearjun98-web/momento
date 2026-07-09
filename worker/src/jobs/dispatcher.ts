import { pool } from '../lib/db.js';
import { JobRecord, PhaseResult } from '../models.js';
import { runHandbookJob } from '../generators/handbook.js';
import { runAudioJob } from '../generators/audio.js';
import { runReportJob } from '../generators/report.js';
import { runFlashcardsJob, runMindMapJob, runQuizJob } from '../generators/studyArtifacts.js';
import { runVideoJob } from '../generators/video.js';
import { Sentry } from '../lib/sentry.js';

const MAX_ATTEMPTS = 3;

// A job stuck in the 'running' state for longer than this almost certainly
// means the worker crashed or restarted mid-job (Railway redeploy, OOM, etc.),
// because a job that fails normally is caught and requeued in runJob. Nothing
// would ever pick these back up, so the reaper reclaims them.
const STUCK_JOB_TIMEOUT_MINUTES = Number(process.env.STUCK_JOB_TIMEOUT_MINUTES ?? 15);

export async function claimNextJob(): Promise<JobRecord | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query<JobRecord>(
      `
      SELECT *
      FROM public.jobs
      WHERE status = 'queued'
        AND available_at <= now()
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
      `,
    );

    const job = result.rows[0];
    if (!job) {
      await client.query('COMMIT');
      return null;
    }

    const updated = await client.query<JobRecord>(
      `
      UPDATE public.jobs
      SET status = 'running',
          phase = 'claimed',
          attempts = attempts + 1,
          started_at = now(),
          last_error = NULL
      WHERE id = $1
      RETURNING *
      `,
      [job.id],
    );

    await client.query('COMMIT');
    return updated.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Reclaims jobs frozen in the 'running' state by a crashed/restarted worker.
// Jobs still under the retry limit go back to 'queued' to be tried again; jobs
// that have already used all their attempts are dead-lettered and reported to
// Sentry (a crashed worker leaves no error, so this is the only place they
// surface). Returns the number of jobs it acted on.
export async function reapStuckJobs(): Promise<number> {
  const result = await pool.query<{ id: string; type: string; status: string }>(
    `
    UPDATE public.jobs
    SET status = CASE WHEN attempts >= $1 THEN 'dead' ELSE 'queued' END::public.job_status,
        phase = CASE WHEN attempts >= $1 THEN 'dead' ELSE 'retry_wait' END,
        last_error = CASE
          WHEN attempts >= $1
            THEN 'Job exceeded max attempts after the worker stopped responding mid-job (reclaimed by the stuck-job reaper).'
          ELSE 'Job was stuck in the running state and reclaimed by the stuck-job reaper (worker likely crashed or restarted mid-job).'
        END,
        available_at = now(),
        finished_at = CASE WHEN attempts >= $1 THEN now() ELSE finished_at END
    WHERE status = 'running'
      AND started_at IS NOT NULL
      AND started_at < now() - ($2 || ' minutes')::interval
    RETURNING id, type, status
    `,
    [MAX_ATTEMPTS, STUCK_JOB_TIMEOUT_MINUTES],
  );

  for (const row of result.rows) {
    console.warn('reaped stuck job', { jobId: row.id, type: row.type, newStatus: row.status });
    if (row.status === 'dead') {
      Sentry.captureMessage(
        `Stuck job dead-lettered by reaper: ${row.type} (${row.id})`,
        'error',
      );
    }
  }

  return result.rowCount ?? 0;
}

async function getCompletedPhases(jobId: string): Promise<Set<string>> {
  const result = await pool.query<{ phase: string }>(
    'SELECT phase FROM public.job_phases WHERE job_id = $1',
    [jobId],
  );
  return new Set(result.rows.map((row) => row.phase));
}

async function recordPhase(job: JobRecord, phase: PhaseResult): Promise<void> {
  await pool.query(
    `
    INSERT INTO public.job_phases (job_id, phase, output_jsonb, storage_path)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (job_id, phase) DO NOTHING
    `,
    [job.id, phase.phase, phase.output ?? {}, phase.storagePath ?? null],
  );

  await pool.query(
    `
    UPDATE public.jobs
    SET phase = $2,
        progress_pct = GREATEST(progress_pct, $3)
    WHERE id = $1
    `,
    [job.id, phase.phase, phase.progressPct ?? job.progress_pct ?? 0],
  );
}

async function dispatch(job: JobRecord): Promise<PhaseResult[]> {
  const completedPhases = await getCompletedPhases(job.id);

  switch (job.type) {
    case 'handbook':
      return runHandbookJob(job, completedPhases);
    case 'audio':
      return runAudioJob(job, completedPhases);
    case 'report':
      return runReportJob(job, completedPhases);
    case 'quiz':
      return runQuizJob(job, completedPhases);
    case 'flashcards':
      return runFlashcardsJob(job, completedPhases);
    case 'mindmap':
      return runMindMapJob(job, completedPhases);
    case 'video':
      return runVideoJob(job, completedPhases);
    default:
      throw new Error(`Unsupported job type: ${job.type}`);
  }
}

export async function runJob(job: JobRecord): Promise<void> {
  try {
    const phases = await dispatch(job);
    for (const phase of phases) {
      await recordPhase(job, phase);
    }

    await pool.query(
      `
      UPDATE public.jobs
      SET status = 'completed',
          phase = 'completed',
          progress_pct = 100,
          finished_at = now()
      WHERE id = $1
      `,
      [job.id],
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown worker error';
    const nextAttempts = job.attempts;
    const isDead = nextAttempts >= MAX_ATTEMPTS;
    const delaySeconds = Math.pow(2, nextAttempts) * 30;

    await pool.query(
      `
      UPDATE public.jobs
      SET status = $2::public.job_status,
          phase = $3,
          last_error = $4,
          available_at = CASE WHEN $2 = 'queued' THEN now() + ($5 || ' seconds')::interval ELSE available_at END,
          finished_at = CASE WHEN $2 = 'dead' THEN now() ELSE finished_at END
      WHERE id = $1
      `,
      [job.id, isDead ? 'dead' : 'queued', isDead ? 'dead' : 'retry_wait', message, delaySeconds],
    );

    if (isDead) {
      console.error('job dead-lettered', { jobId: job.id, type: job.type, error: message });
      Sentry.captureException(error, {
        tags: { job_status: 'dead', job_type: job.type },
        extra: { jobId: job.id, attempts: nextAttempts },
      });
    }
  }
}
