-- One planning job per approved draft. Model generation is claimed exactly once.
create table public.technical_design_jobs (
  id uuid primary key default gen_random_uuid(),
  design_request_id uuid not null references public.design_requests(id) on delete cascade,
  design_analysis_id uuid not null unique references public.design_analyses(id) on delete cascade,
  repository_sha text not null check (repository_sha ~ '^[0-9a-f]{40}$'),
  prompt_version text not null check (char_length(prompt_version) between 1 and 100),
  model text not null check (char_length(model) between 1 and 200),
  status text not null default 'dispatching' check (status in ('dispatching', 'queued', 'running', 'completed', 'failed')),
  github_run_id text unique check (github_run_id ~ '^[1-9][0-9]*$'),
  github_run_attempt integer check (github_run_attempt = 1),
  technical_instructions jsonb check (jsonb_typeof(technical_instructions) = 'object'),
  error text check (char_length(error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  check ((github_run_id is null) = (github_run_attempt is null)),
  check (
    (status in ('dispatching', 'queued') and started_at is null and finished_at is null and technical_instructions is null and error is null)
    or (status = 'running' and github_run_id is not null and started_at is not null and finished_at is null and technical_instructions is null and error is null)
    or (status = 'completed' and github_run_id is not null and started_at is not null and finished_at is not null and technical_instructions is not null and error is null)
    or (status = 'failed' and finished_at is not null and technical_instructions is null and error is not null)
  )
);
create index technical_design_jobs_request on public.technical_design_jobs(design_request_id);
create trigger technical_design_jobs_updated_at before update on public.technical_design_jobs
  for each row execute function public.set_design_request_updated_at();
alter table public.technical_design_jobs enable row level security;
revoke all on public.technical_design_jobs from public, anon, authenticated, service_role;
grant select on public.technical_design_jobs to service_role;

create function public.reserve_technical_design_job(p_request_id uuid, p_user_id text, p_repository_sha text, p_prompt_version text, p_model text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request public.design_requests; draft public.design_analyses; job public.technical_design_jobs;
begin
  select * into request from public.design_requests where id = p_request_id and canva_user_id = p_user_id for update;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  select * into draft from public.design_analyses where design_request_id = request.id and status = 'completed' order by version desc limit 1;
  if request.analysis_status <> 'completed' or not coalesce(draft.ready, false) then
    return jsonb_build_object('state', 'not_ready');
  end if;
  select * into job from public.technical_design_jobs where design_analysis_id = draft.id;
  if found then return jsonb_build_object('state', 'existing', 'job', to_jsonb(job)); end if;
  insert into public.technical_design_jobs(design_request_id, design_analysis_id, repository_sha, prompt_version, model)
    values (request.id, draft.id, p_repository_sha, p_prompt_version, p_model) returning * into job;
  return jsonb_build_object('state', 'created', 'job', to_jsonb(job));
end; $$;

create function public.record_technical_design_job_dispatch(p_job_id uuid, p_run_id text, p_failed boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare job public.technical_design_jobs;
begin
  select * into job from public.technical_design_jobs where id = p_job_id for update;
  if not found then raise exception 'Planning job not found'; end if;
  if p_failed then
    update public.technical_design_jobs set status = 'failed', error = 'GitHub rejected the planning workflow dispatch.', finished_at = now()
      where id = job.id and status = 'dispatching' and github_run_id is null;
    return;
  end if;
  if p_run_id is null or p_run_id !~ '^[1-9][0-9]*$' then raise exception 'Invalid GitHub run ID'; end if;
  if job.github_run_id is not null and job.github_run_id <> p_run_id then raise exception 'Planning run identity changed'; end if;
  update public.technical_design_jobs set status = 'queued', github_run_id = p_run_id, github_run_attempt = 1
    where id = job.id and status = 'dispatching';
end; $$;

create function public.claim_technical_design_job(p_job_id uuid, p_run_id text, p_run_attempt integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare job public.technical_design_jobs; request public.design_requests; draft public.design_analyses;
begin
  if p_run_id !~ '^[1-9][0-9]*$' or p_run_attempt is distinct from 1 then
    return jsonb_build_object('claimed', false);
  end if;
  select * into job from public.technical_design_jobs where id = p_job_id for update;
  if not found or job.status not in ('dispatching', 'queued') or (job.github_run_id is not null and job.github_run_id <> p_run_id) then
    return jsonb_build_object('claimed', false);
  end if;
  select * into request from public.design_requests where id = job.design_request_id;
  select * into draft from public.design_analyses where id = job.design_analysis_id;
  if not found or draft.status <> 'completed' or not draft.ready then
    raise exception 'Approved draft is unavailable';
  end if;
  update public.technical_design_jobs
    set status = 'running', github_run_id = p_run_id, github_run_attempt = p_run_attempt, started_at = now()
    where id = job.id returning * into job;
  return jsonb_build_object('claimed', true, 'job', to_jsonb(job), 'designRequest', jsonb_build_object(
    'id', request.id, 'instructions', request.instructions, 'design_image', request.design_image,
    'change_options', request.change_options, 'draft_version', draft.version,
    'requirements', draft.requirements, 'plan', draft.plan, 'answers', draft.answers
  ));
end; $$;

create function public.finish_technical_design_job(p_job_id uuid, p_run_id text, p_run_attempt integer, p_instructions jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.technical_design_jobs;
begin
  select * into job from public.technical_design_jobs where id = p_job_id for update;
  if not found or job.github_run_id is distinct from p_run_id or job.github_run_attempt is distinct from p_run_attempt then return false; end if;
  if job.status = 'completed' then return job.technical_instructions = p_instructions; end if;
  if job.status <> 'running' then return false; end if;
  update public.technical_design_jobs set status = 'completed', technical_instructions = p_instructions, finished_at = now() where id = job.id;
  return true;
end; $$;

create function public.fail_technical_design_job(p_job_id uuid, p_run_id text, p_run_attempt integer, p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare job public.technical_design_jobs;
begin
  select * into job from public.technical_design_jobs where id = p_job_id for update;
  if not found or job.github_run_id is distinct from p_run_id or job.github_run_attempt is distinct from p_run_attempt then return false; end if;
  if job.status = 'failed' then return true; end if;
  if job.status <> 'running' then return false; end if;
  update public.technical_design_jobs set status = 'failed', error = left(p_error, 500), finished_at = now() where id = job.id;
  return true;
end; $$;

revoke all on function public.reserve_technical_design_job(uuid,text,text,text,text), public.record_technical_design_job_dispatch(uuid,text,boolean), public.claim_technical_design_job(uuid,text,integer), public.finish_technical_design_job(uuid,text,integer,jsonb), public.fail_technical_design_job(uuid,text,integer,text) from public, anon, authenticated;
grant execute on function public.reserve_technical_design_job(uuid,text,text,text,text), public.record_technical_design_job_dispatch(uuid,text,boolean), public.claim_technical_design_job(uuid,text,integer), public.finish_technical_design_job(uuid,text,integer,jsonb), public.fail_technical_design_job(uuid,text,integer,text) to service_role;

-- Completion can arrive before the dispatch response or first worker callback.
-- The job ID comes from the authenticated workflow_run event's run name.
create function public.reconcile_technical_design_run(p_job_id uuid, p_run_id text, p_run_attempt integer)
returns void language plpgsql security definer set search_path = '' as $$
declare job public.technical_design_jobs;
begin
  if p_run_id is null or p_run_id !~ '^[1-9][0-9]*$' or p_run_attempt is distinct from 1 then return; end if;
  select * into job from public.technical_design_jobs where id = p_job_id for update;
  if not found or job.status in ('completed', 'failed') then return; end if;
  if job.github_run_id is null then
    if job.status <> 'dispatching' then return; end if;
  elsif job.github_run_id <> p_run_id or job.github_run_attempt is distinct from p_run_attempt then
    return;
  end if;
  update public.technical_design_jobs
    set status = 'failed', github_run_id = p_run_id, github_run_attempt = p_run_attempt,
        error = 'GitHub workflow ended before instructions were saved.', finished_at = now()
    where id = job.id;
end; $$;
revoke all on function public.reconcile_technical_design_run(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.reconcile_technical_design_run(uuid,text,integer) to service_role;
