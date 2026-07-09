CREATE TABLE IF NOT EXISTS public.handbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid REFERENCES public.notebooks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  format text,
  length text,
  word_count int,
  source_count int,
  custom_prompt text,
  model text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.handbook_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handbook_id uuid REFERENCES public.handbooks(id) ON DELETE CASCADE,
  level int NOT NULL,
  title text NOT NULL,
  content_markdown text NOT NULL,
  order_index int NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content_markdown)) STORED,
  UNIQUE(handbook_id, order_index)
);

CREATE INDEX IF NOT EXISTS handbooks_notebook_created_idx
  ON public.handbooks(notebook_id, created_at DESC);

CREATE INDEX IF NOT EXISTS handbooks_user_created_idx
  ON public.handbooks(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS handbook_sections_handbook_order_idx
  ON public.handbook_sections(handbook_id, order_index);

CREATE INDEX IF NOT EXISTS handbook_sections_search_idx
  ON public.handbook_sections USING GIN(search_vector);

CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id uuid REFERENCES public.notebooks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  format text,
  tone text,
  word_count int,
  source_count int,
  custom_prompt text,
  model text,
  has_images boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.report_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.reports(id) ON DELETE CASCADE,
  level int NOT NULL,
  title text NOT NULL,
  content_markdown text NOT NULL,
  order_index int NOT NULL,
  search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', content_markdown)) STORED,
  UNIQUE(report_id, order_index)
);

CREATE INDEX IF NOT EXISTS reports_notebook_created_idx
  ON public.reports(notebook_id, created_at DESC);

CREATE INDEX IF NOT EXISTS reports_user_created_idx
  ON public.reports(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS report_sections_report_order_idx
  ON public.report_sections(report_id, order_index);

CREATE INDEX IF NOT EXISTS report_sections_search_idx
  ON public.report_sections USING GIN(search_vector);

ALTER TABLE public.handbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handbook_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own handbooks" ON public.handbooks;
CREATE POLICY "users manage own handbooks"
  ON public.handbooks
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users read own handbook sections" ON public.handbook_sections;
CREATE POLICY "users read own handbook sections"
  ON public.handbook_sections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.handbooks h
      WHERE h.id = handbook_sections.handbook_id
        AND h.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users manage own reports" ON public.reports;
CREATE POLICY "users manage own reports"
  ON public.reports
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users read own report sections" ON public.report_sections;
CREATE POLICY "users read own report sections"
  ON public.report_sections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.reports r
      WHERE r.id = report_sections.report_id
        AND r.user_id = auth.uid()
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.handbooks;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
