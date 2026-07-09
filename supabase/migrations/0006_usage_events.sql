CREATE TABLE IF NOT EXISTS public.usage_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id),
  job_id uuid REFERENCES public.jobs(id),
  provider text NOT NULL,
  model text NOT NULL,
  tokens_in int,
  tokens_out int,
  chars int,
  images int,
  cost_usd numeric(10,6) NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_user_created_idx
  ON public.usage_events(user_id, created_at);

CREATE INDEX IF NOT EXISTS usage_events_job_idx
  ON public.usage_events(job_id);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own usage events" ON public.usage_events;
CREATE POLICY "users read own usage events"
  ON public.usage_events
  FOR SELECT
  USING (user_id = auth.uid());
