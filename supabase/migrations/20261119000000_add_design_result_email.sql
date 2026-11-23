-- Keep each job's selected result email and delivery time for safe retries.
alter table public.technical_design_jobs
  add column result_email jsonb check (result_email is null or jsonb_typeof(result_email) = 'object'),
  add column email_sent_at timestamptz,
  add constraint design_email_sent_requires_message check (email_sent_at is null or result_email is not null);

grant update (result_email, email_sent_at) on public.technical_design_jobs to service_role;
