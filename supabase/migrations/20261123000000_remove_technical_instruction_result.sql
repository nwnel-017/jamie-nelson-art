-- Record the implementation handoff without requiring generated technical instructions.
alter table public.technical_design_jobs drop column technical_instructions;
drop function public.finish_technical_design_job(uuid,text,integer,jsonb);
create function public.finish_technical_design_job(p_job_id uuid, p_run_id text, p_run_attempt integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.technical_design_jobs;
begin
  select * into job from public.technical_design_jobs where id = p_job_id for update;
  if not found or job.github_run_id is distinct from p_run_id or job.github_run_attempt is distinct from p_run_attempt then return false; end if;
  if job.status = 'completed' then return true; end if;
  if job.status <> 'running' then return false; end if;
  update public.technical_design_jobs set status = 'completed', finished_at = now() where id = job.id;
  return true;
end; $$;
revoke all on function public.finish_technical_design_job(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.finish_technical_design_job(uuid,text,integer) to service_role;
alter table public.technical_design_jobs add constraint technical_design_jobs_lifecycle check (
  (status in ('dispatching','queued') and started_at is null and finished_at is null and error is null)
  or (status = 'running' and github_run_id is not null and started_at is not null and finished_at is null and error is null)
  or (status = 'completed' and github_run_id is not null and started_at is not null and finished_at is not null and error is null)
  or (status = 'failed' and finished_at is not null and error is not null)
);
