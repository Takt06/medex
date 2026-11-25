-- ============================================================================
-- MedEx Olongapo City — Phase 3 Supabase Storage Buckets & Policies
-- Run this SECOND in Supabase Dashboard -> SQL Editor (after schema.sql)
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'prescriptions',
    'prescriptions',
    FALSE,
    5242880, -- 5 MB
    ARRAY['image/jpeg', 'image/png', 'application/pdf']
  ),
  (
    'product-images',
    'product-images',
    TRUE,
    3145728, -- 3 MB
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Prescriptions Bucket Policies (Strictly Private)
CREATE POLICY "rx_resident_upload_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'prescriptions'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "rx_read_resident_merchant_admin"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_approved_admin()
    OR EXISTS (
      SELECT 1
      FROM public.prescriptions p
      WHERE p.storage_path = name
        AND p.merchant_id = public.current_medex_user_id()
        AND public.current_medex_status() = 'approved'
    )
  )
);

-- Product Images Bucket Policies (Public Read, Approved Merchant Write)
CREATE POLICY "product_images_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

CREATE POLICY "product_images_approved_merchant_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (
    public.is_approved_admin()
    OR (public.current_medex_role() = 'merchant' AND public.current_medex_status() = 'approved')
  )
);

CREATE POLICY "product_images_approved_merchant_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    public.is_approved_admin()
    OR (public.current_medex_role() = 'merchant' AND public.current_medex_status() = 'approved')
  )
);

CREATE POLICY "product_images_approved_merchant_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    public.is_approved_admin()
    OR (public.current_medex_role() = 'merchant' AND public.current_medex_status() = 'approved')
  )
);
