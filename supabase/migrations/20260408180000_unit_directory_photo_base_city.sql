-- Optional base/installment city and listing photo for unit directory entries
ALTER TABLE public.unit_directory
  ADD COLUMN IF NOT EXISTS base_city text,
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN public.unit_directory.base_city IS 'Installation, city, or local area (free text, shown under state)';
COMMENT ON COLUMN public.unit_directory.photo_url IS 'Public URL for unit badge/photo (e.g. Supabase Storage)';
