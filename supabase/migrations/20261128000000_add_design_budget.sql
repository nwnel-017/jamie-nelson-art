-- Keep one durable spending balance and unresolved hold for each design update.
create table public.design_budgets (
  design_request_id uuid primary key references public.design_requests(id) on delete cascade,
  spent_nano bigint not null default 0 check (spent_nano >= 0),
  stages jsonb not null default '{}',
  status text not null default 'running' check (status in ('running', 'stopped')),
  stop_reason text,
  reservation jsonb
);
alter table public.design_budgets enable row level security;
revoke all on public.design_budgets from public, anon, authenticated, service_role;
grant select on public.design_budgets to service_role;

create or replace function public.design_budget_action(p_id uuid, p_owner text, p_action text, p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.design_budgets;
  cap bigint;
  allowance bigint;
  used_input bigint;
  cached bigint;
  used_output bigint;
  charge bigint;
  stage text;
  totals jsonb;
begin
  -- The backend supplies the authenticated owner, never a caller-provided identity.
  perform 1 from public.design_requests where id = p_id and canva_user_id = p_owner;
  if not found then return jsonb_build_object('state', 'not_found'); end if;
  insert into public.design_budgets(design_request_id) values (p_id) on conflict do nothing;
  select * into b from public.design_budgets where design_request_id = p_id for update;
  if p_action = 'inspect' then return to_jsonb(b); end if;
  if p_action = 'reserve' or p_action = 'stop' then
    if b.status = 'stopped' then return jsonb_build_object('state', 'stopped'); end if;
    if b.reservation is not null then return jsonb_build_object('state', 'busy'); end if;
    if p_action = 'stop' then
      update public.design_budgets set status = 'stopped', stop_reason = p_payload->>'reason' where design_request_id = p_id;
      return jsonb_build_object('state', 'stopped');
    end if;
    allowance := (p_payload->>'allowance')::bigint;
    stage := p_payload->>'stage';
    if allowance is null or allowance <= 0 or allowance > 9007199254740991 or stage is null or stage not in ('analysis', 'clarification', 'implementation', 'verification', 'repair') or coalesce(p_payload->>'request_id', '') = '' then
      raise exception 'Invalid budget admission';
    end if;
    -- GPT-4.1 standard: full 1,047,576-token input at $2/M; output at $8/M.
    cap := least(8192, floor((allowance - b.spent_nano - 2095152000)::numeric / 8000)::bigint);
    if cap < 16 then
      update public.design_budgets set status = 'stopped', stop_reason = 'insufficient_funds' where design_request_id = p_id;
      return jsonb_build_object('state', 'stopped');
    end if;
    update public.design_budgets set reservation = jsonb_build_object(
      'request_id', p_payload->>'request_id', 'stage', stage,
      'amount_nano', 2095152000 + cap * 8000,
      'model', 'gpt-4.1-2025-04-14', 'tier', 'default',
      'input_bound', 1047576, 'max_output_tokens', cap,
      'input_rate_nano', 2000, 'cached_rate_nano', 500, 'output_rate_nano', 8000
    ) where design_request_id = p_id;
    return jsonb_build_object('state', 'reserved', 'max_output_tokens', cap);
  end if;
  if b.reservation is null or b.reservation->>'request_id' is distinct from p_payload->>'request_id' then
    return jsonb_build_object('state', 'stale');
  end if;
  if p_action = 'uncertain' then
    update public.design_budgets set status = 'stopped', stop_reason = 'unknown_usage' where design_request_id = p_id;
    return jsonb_build_object('state', 'stopped');
  end if;
  if p_action <> 'settle' then raise exception 'Unknown budget action'; end if;
  if b.status = 'stopped' then return jsonb_build_object('state', 'stopped'); end if;
  used_input := (p_payload->>'input_tokens')::bigint;
  cached := (p_payload->>'cached_tokens')::bigint;
  used_output := (p_payload->>'output_tokens')::bigint;
  if used_input is null or cached is null or used_output is null or used_input < 0 or cached < 0 or cached > used_input or used_input > (b.reservation->>'input_bound')::bigint or used_output < 0 or used_output > (b.reservation->>'max_output_tokens')::bigint then
    update public.design_budgets set status = 'stopped', stop_reason = 'invalid_usage' where design_request_id = p_id;
    return jsonb_build_object('state', 'stopped');
  end if;
  charge := (used_input - cached) * (b.reservation->>'input_rate_nano')::bigint + cached * (b.reservation->>'cached_rate_nano')::bigint + used_output * (b.reservation->>'output_rate_nano')::bigint;
  if charge > (b.reservation->>'amount_nano')::bigint then
    update public.design_budgets set status = 'stopped', stop_reason = 'out_of_bound_usage' where design_request_id = p_id;
    return jsonb_build_object('state', 'stopped');
  end if;
  stage := b.reservation->>'stage';
  totals := coalesce(b.stages->stage, '{}');
  totals := jsonb_build_object(
    'input_tokens', coalesce((totals->>'input_tokens')::bigint, 0) + used_input,
    'cached_tokens', coalesce((totals->>'cached_tokens')::bigint, 0) + cached,
    'output_tokens', coalesce((totals->>'output_tokens')::bigint, 0) + used_output,
    'spent_nano', coalesce((totals->>'spent_nano')::bigint, 0) + charge
  );
  update public.design_budgets set spent_nano = b.spent_nano + charge, stages = jsonb_set(b.stages, array[stage], totals), reservation = null where design_request_id = p_id;
  return jsonb_build_object('state', 'settled');
end;
$$;
revoke all on function public.design_budget_action(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.design_budget_action(uuid, text, text, jsonb) to service_role;
