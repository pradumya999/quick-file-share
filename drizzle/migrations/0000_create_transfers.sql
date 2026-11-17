CREATE TABLE public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code ~ '^[0-9]{6}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.transfer_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  size BIGINT NOT NULL CHECK (size >= 0),
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  storage_path TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX transfer_files_transfer_id_idx ON public.transfer_files(transfer_id);

GRANT ALL ON public.transfers TO service_role;
GRANT ALL ON public.transfer_files TO service_role;

ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_files ENABLE ROW LEVEL SECURITY;
