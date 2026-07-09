INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Users can upload to their notebooks" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their documents" ON storage.objects;

CREATE POLICY "Users can upload to their notebooks"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.notebooks WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can view their documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.notebooks WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.notebooks WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.notebooks WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.notebooks WHERE user_id = auth.uid()
  )
);
