-- Run manually in the Supabase SQL editor before deploying the matching code.
ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS last_activity text NOT NULL DEFAULT 'Folder created';

-- Existing folders predate activity tracking. Preserve their real creation time
-- while marking their last known activity honestly.
UPDATE public.folders
SET last_activity = 'Folder created'
WHERE last_activity IS NULL;
