-- Persist the user-facing response introduced in the analysis contract.
alter table public.design_analyses add column response text not null default 'Please review your design requirements.';

create or replace function public.finish_design_analysis(p_request_id uuid,p_user_id text,p_submission_id uuid,p_analysis jsonb,p_answers jsonb)
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
    response=p_analysis->>'response',plan=p_analysis->'plan',requirements=p_analysis->'requirements',ambiguities=p_analysis->'ambiguities',
    clarifying_questions=p_analysis->'clarifying_questions',answers=all_answers,
    ready=(p_analysis->>'ready')::boolean,finished_at=now()
    where design_request_id=r.id and submission_id=p_submission_id;
  update public.design_requests set requirements=p_analysis->'requirements',ambiguities=p_analysis->'ambiguities',
    clarifying_questions=(select coalesce(jsonb_agg(q->>'question'),'[]'::jsonb) from jsonb_array_elements(p_analysis->'clarifying_questions') as q),
    clarifications=all_answers,clarified_at=case when (p_analysis->>'ready')::boolean then now() else null end,analysis_status='completed' where id=r.id;
  return next_version;
end; $$;


notify pgrst, 'reload schema';
