alter table public.design_requests
  add column canva_user_id text,
  add column clarifications jsonb not null default '[]'::jsonb
    check (jsonb_typeof(clarifications) = 'array'),
  add column clarified_at timestamptz;

create index design_requests_canva_user_id_idx on public.design_requests (canva_user_id);
