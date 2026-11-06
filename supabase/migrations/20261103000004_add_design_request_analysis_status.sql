-- Existing rows already contain analysis; new requests start pending.
alter table public.design_requests
  add column analysis_status text not null default 'completed'
    check (analysis_status in ('pending', 'completed', 'failed'));
alter table public.design_requests alter column analysis_status set default 'pending';
