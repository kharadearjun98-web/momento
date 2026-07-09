# Storage Bucket Policies

Tracked migration: `supabase/migrations/0007_documents_storage.sql`.

## Documents bucket

Run bucket creation in Supabase SQL Editor:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;
```

### Policy 1: Allow users to upload to their notebooks
```sql
CREATE POLICY "Users can upload to their notebooks"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.notebooks WHERE user_id = auth.uid()
  )
);
```

### Policy 2: Allow users to view their documents
```sql
CREATE POLICY "Users can view their documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.notebooks WHERE user_id = auth.uid()
  )
);
```

### Policy 3: Allow users to update their documents
```sql
CREATE POLICY "Users can update their documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.notebooks WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.notebooks WHERE user_id = auth.uid()
  )
);
```

### Policy 4: Allow users to delete their documents
```sql
CREATE POLICY "Users can delete their documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] IN (
    SELECT id::text FROM public.notebooks WHERE user_id = auth.uid()
  )
);
```

## Assets bucket

Tracked migration: `supabase/migrations/0008_lock_down_assets_storage.sql`.
