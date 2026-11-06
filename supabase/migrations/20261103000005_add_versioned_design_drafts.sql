alter table public.design_requests
  add column analyze_attempts integer not null default 0 check (analyze_attempts >= 0),
  add column change_options text[] not null default '{}'
    check (change_options <@ array['existing_pages', 'new_pages', 'website_theme']);
update public.design_requests set analyze_attempts = 1 where analysis_status <> 'pending';

-- Each attempt is reserved before the model call. Only completed attempts have
-- immutable result data and a version; failed calls leave version history intact.
create table public.design_analyses (
  id uuid primary key default gen_random_uuid(),
  design_request_id uuid not null references public.design_requests(id) on delete cascade,
  submission_id uuid not null,
  base_version integer not null check (base_version >= 0),
  payload_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  version integer check (version > 0),
  plan jsonb check (jsonb_typeof(plan) = 'object' and plan ? 'steps' and jsonb_typeof(plan->'steps') = 'array'),
  requirements jsonb check (jsonb_typeof(requirements) = 'array'),
  ambiguities jsonb check (jsonb_typeof(ambiguities) = 'array'),
  clarifying_questions jsonb check (jsonb_typeof(clarifying_questions) = 'array'),
  answers jsonb check (jsonb_typeof(answers) = 'array'),
  ready boolean,
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (design_request_id, version),
  unique (design_request_id, submission_id),
  check (
    (status = 'completed' and version is not null and version = base_version + 1
      and plan is not null and requirements is not null and ambiguities is not null
      and clarifying_questions is not null and answers is not null and ready is not null
      and finished_at is not null)
    or (status in ('pending', 'failed') and version is null and plan is null
      and requirements is null and ambiguities is null and clarifying_questions is null
      and answers is null and ready is null
      and ((status = 'pending' and finished_at is null) or (status = 'failed' and finished_at is not null)))
  ),
  check (not ready or (jsonb_array_length(plan->'steps') > 0 and jsonb_array_length(ambiguities) = 0 and jsonb_array_length(clarifying_questions) = 0))
);
create unique index design_analysis_one_pending on public.design_analyses(design_request_id) where status = 'pending';
alter table public.design_analyses enable row level security;
-- Service clients can read history; only the RPCs below can mutate attempts.
revoke all on public.design_analyses from public, anon, authenticated, service_role;
grant select on public.design_analyses to service_role;

-- Keep existing analyses as an initial draft, without assuming an old plan is executable.
insert into public.design_analyses (design_request_id,version,base_version,status,payload_hash,finished_at,plan,requirements,ambiguities,clarifying_questions,answers,ready,submission_id)
select r.id,1,0,'completed','legacy-backfill',now(),
  jsonb_build_object('steps',coalesce((select jsonb_agg(jsonb_build_object('id','step-'||n,'action',v,'target',null)) from jsonb_array_elements_text(r.requirements) with ordinality as t(v,n)), '[]'::jsonb)),
  r.requirements,r.ambiguities,
  case when jsonb_array_length(r.clarifying_questions)>0 then
    (select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'question',v)) from jsonb_array_elements_text(r.clarifying_questions) as t(v))
  else jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'question','Which exact pages or theme changes should this plan cover?')) end,
  coalesce((select jsonb_agg(jsonb_build_object('question_id',coalesce(v->>'question_id',gen_random_uuid()::text),'question',v->>'question','answer',v->>'answer')) from jsonb_array_elements(r.clarifications) as t(v)), '[]'::jsonb), false, gen_random_uuid()
from public.design_requests r where r.analysis_status = 'completed';

create function public.reserve_design_analysis(p_request_id uuid,p_user_id text,p_submission_id uuid,p_base_version integer,p_payload_hash text,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.design_requests; run public.design_analyses; latest integer; latest_ready boolean;
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'Invalid analysis limit'; end if;
  select * into r from public.design_requests where id=p_request_id and canva_user_id=p_user_id for update;
  if not found then return jsonb_build_object('state','not_found'); end if;
  select * into run from public.design_analyses where design_request_id=r.id and submission_id=p_submission_id;
  if found then
    if run.payload_hash <> p_payload_hash then return jsonb_build_object('state','conflict'); end if;
    if run.status='completed' then return jsonb_build_object('state','completed','version',run.version); end if;
    if run.status='failed' then return jsonb_build_object('state','failed'); end if;
    if run.started_at > now()-interval '2 minutes' then return jsonb_build_object('state','processing'); end if;
    update public.design_analyses set status='failed',finished_at=now() where design_request_id=r.id and submission_id=p_submission_id;
    update public.design_requests set analysis_status='failed' where id=r.id;
    return jsonb_build_object('state','failed');
  end if;
  update public.design_analyses set status='failed',finished_at=now() where design_request_id=r.id and status='pending' and started_at <= now()-interval '2 minutes';
  if exists(select 1 from public.design_analyses where design_request_id=r.id and status='pending') then return jsonb_build_object('state','processing'); end if;
  select version,ready into latest,latest_ready from public.design_analyses where design_request_id=r.id and status='completed' order by version desc limit 1;
  latest := coalesce(latest,0);
  if latest<>p_base_version then return jsonb_build_object('state','stale'); end if;
  if coalesce(latest_ready,false) then return jsonb_build_object('state','ready'); end if;
  if r.analyze_attempts>=p_limit then return jsonb_build_object('state','limit'); end if;
  insert into public.design_analyses(design_request_id,submission_id,base_version,payload_hash) values(r.id,p_submission_id,p_base_version,p_payload_hash);
  update public.design_requests set analyze_attempts=analyze_attempts+1,analysis_status='pending' where id=r.id;
  return jsonb_build_object('state','reserved');
end; $$;

create function public.finish_design_analysis(p_request_id uuid,p_user_id text,p_submission_id uuid,p_analysis jsonb,p_answers jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare r public.design_requests; run public.design_analyses; prior public.design_analyses; next_version integer; all_answers jsonb;
begin
  select * into r from public.design_requests where id=p_request_id and canva_user_id=p_user_id for update;
  if not found then raise exception 'Design request not found'; end if;
  select * into run from public.design_analyses where design_request_id=r.id and submission_id=p_submission_id;
  if run.status='completed' then return run.version; end if;
  if run.status is distinct from 'pending' then raise exception 'Analysis reservation is not active'; end if;
  select * into prior from public.design_analyses where design_request_id=r.id and status='completed' order by version desc limit 1;
  if coalesce(prior.version,0)<>run.base_version then raise exception 'Draft version changed'; end if;
  next_version:=run.base_version+1;
  all_answers:=coalesce(prior.answers,'[]'::jsonb)||p_answers;
  update public.design_analyses set status='completed',version=next_version,
    plan=p_analysis->'plan',requirements=p_analysis->'requirements',ambiguities=p_analysis->'ambiguities',
    clarifying_questions=p_analysis->'clarifying_questions',answers=all_answers,
    ready=(p_analysis->>'ready')::boolean,finished_at=now()
    where design_request_id=r.id and submission_id=p_submission_id;
  update public.design_requests set requirements=p_analysis->'requirements',ambiguities=p_analysis->'ambiguities',
    clarifying_questions=(select coalesce(jsonb_agg(q->>'question'),'[]'::jsonb) from jsonb_array_elements(p_analysis->'clarifying_questions') as q),
    clarifications=all_answers,clarified_at=case when (p_analysis->>'ready')::boolean then now() else null end,analysis_status='completed' where id=r.id;
  return next_version;
end; $$;

create function public.fail_design_analysis(p_request_id uuid,p_user_id text,p_submission_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.design_requests where id=p_request_id and canva_user_id=p_user_id for update;
  if not found then return; end if;
  update public.design_analyses set status='failed',finished_at=now() where design_request_id=p_request_id and submission_id=p_submission_id and status='pending';
  if found then update public.design_requests set analysis_status='failed' where id=p_request_id; end if;
end; $$;
revoke all on function public.reserve_design_analysis(uuid,text,uuid,integer,text,integer),public.finish_design_analysis(uuid,text,uuid,jsonb,jsonb),public.fail_design_analysis(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_design_analysis(uuid,text,uuid,integer,text,integer),public.finish_design_analysis(uuid,text,uuid,jsonb,jsonb),public.fail_design_analysis(uuid,text,uuid) to service_role;
