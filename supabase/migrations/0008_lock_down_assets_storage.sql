INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Allow authenticated users to upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow public to read assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update own assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete own assets" ON storage.objects;

CREATE POLICY "Allow authenticated users to upload assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'assets'
  AND owner = auth.uid()
);

CREATE POLICY "Allow public to read assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'assets');

CREATE POLICY "Allow authenticated users to update own assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'assets'
  AND owner = auth.uid()
)
WITH CHECK (
  bucket_id = 'assets'
  AND owner = auth.uid()
);

CREATE POLICY "Allow authenticated users to delete own assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'assets'
  AND owner = auth.uid()
);
