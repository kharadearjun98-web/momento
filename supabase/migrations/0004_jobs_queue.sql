CREATE TYPE public.job_status AS ENUM ('queued', 'running', 'completed', 'failed', 'dead');

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  input_jsonb jsonb NOT NULL,
  status public.job_status NOT NULL DEFAULT 'queued',
  phase text,
  progress_pct int DEFAULT 0 CHECK (progress_pct >= 0 AND progress_pct <= 100),
  attempts int DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  cost_usd numeric(10,6) DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX jobs_queued_idx
  ON public.jobs(status, available_at, created_at)
  WHERE status = 'queued';

CREATE INDEX jobs_user_created_at_idx
  ON public.jobs(user_id, created_at DESC);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own jobs"
  ON public.jobs
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users create own jobs"
  ON public.jobs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE TABLE public.job_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  phase text NOT NULL,
  output_jsonb jsonb,
  storage_path text,
  completed_at timestamptz DEFAULT now(),
  UNIQUE(job_id, phase)
);

CREATE INDEX job_phases_job_id_idx
  ON public.job_phases(job_id, completed_at);

ALTER TABLE public.job_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own job phases"
  ON public.job_phases
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.jobs
      WHERE jobs.id = job_phases.job_id
        AND jobs.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON public.jobs TO authenticated;
GRANT SELECT ON public.job_phases TO authenticated;
GRANT ALL ON public.jobs TO service_role;
GRANT ALL ON public.job_phases TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'jobs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.jobs;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'job_phases'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.job_phases;
    END IF;
  END IF;
END $$;
