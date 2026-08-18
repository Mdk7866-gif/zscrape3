-- Adds the private admin workspace flag to folders.
--
-- Folders with is_admin = true (and all their videos, failed URLs and download
-- statuses) are only visible to callers holding an admin session token; see
-- backend/app/admin_auth.py. Existing folders default to false, i.e. they stay
-- public — no behaviour change for anything already in the table.
--
-- Run this once in the Supabase SQL editor. There is no migration tooling in
-- this repo, so schema changes are applied out of band and mirrored back into
-- zscrape3_database.sql / backend/zscrape3database.dbml.

ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- The folder list is always filtered by this flag, so index it alongside the
-- ordering column the sidebar uses.
CREATE INDEX IF NOT EXISTS folders_is_admin_created_at_idx
  ON public.folders (is_admin, created_at DESC);
