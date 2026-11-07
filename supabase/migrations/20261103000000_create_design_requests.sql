create table public.design_requests (
  id uuid primary key default gen_random_uuid(),
  design_image text not null check (
    design_image ~ '^https://'
    or design_image ~ '^http://(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?/storage/v1/object/public/website_designs/'
  ),
  instructions text not null check (char_length(btrim(instructions)) between 1 and 4000),
  requirements jsonb not null check (jsonb_typeof(requirements) = 'array'),
  ambiguities jsonb not null check (jsonb_typeof(ambiguities) = 'array'),
  clarifying_questions jsonb not null check (jsonb_typeof(clarifying_questions) = 'array'),
  canva_user_id text,
  clarifications jsonb not null default '[]'::jsonb check (jsonb_typeof(clarifications) = 'array'),
  clarified_at timestamptz,
  analysis_status text not null default 'pending' check (analysis_status in ('pending', 'completed', 'failed')),
  analyze_attempts integer not null default 0 check (analyze_attempts >= 0),
  change_options text[] not null default '{}' check (change_options <@ array['existing_pages', 'new_pages', 'website_theme']),
  initial_payload_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index design_requests_canva_user_id_idx on public.design_requests (canva_user_id);

create function public.set_design_request_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger design_requests_updated_at
before update on public.design_requests
for each row execute function public.set_design_request_updated_at();

-- Access goes through the Canva-authorized backend using the service role.
alter table public.design_requests enable row level security;
revoke all on public.design_requests from anon, authenticated;
grant select, insert, update, delete on public.design_requests to service_role;
