-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.folders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name character varying NOT NULL UNIQUE,
  -- true = private admin workspace, hidden from normal users (see backend/app/admin_auth.py)
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT folders_pkey PRIMARY KEY (id)
);
CREATE TABLE public.videos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL,
  title text NOT NULL,
  duration_seconds integer NOT NULL,
  url text NOT NULL,
  platform character varying NOT NULL,
  thumbnail text,
  upload_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  file_size_bytes bigint,
  CONSTRAINT videos_pkey PRIMARY KEY (id),
  CONSTRAINT videos_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id)
);
CREATE TABLE public.failed_save_urls (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL,
  url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT failed_save_urls_pkey PRIMARY KEY (id),
  CONSTRAINT failed_save_urls_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id)
);
CREATE TABLE public.video_download_status (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  video_id uuid NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'fresh'::download_status_enum,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT video_download_status_pkey PRIMARY KEY (id),
  CONSTRAINT video_download_status_video_id_fkey FOREIGN KEY (video_id) REFERENCES public.videos(id)
);