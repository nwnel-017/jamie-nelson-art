-- Run against a disposable database with design_requests and the budget migration.
\set ON_ERROR_STOP on
begin;
insert into public.design_requests(id, canva_user_id, design_image, instructions, requirements, ambiguities, clarifying_questions)
values ('00000000-0000-4000-8000-000000000043', 'budget-test', 'https://example.com/image.png', 'test', '[]', '[]', '[]');
do $$
declare result jsonb;
begin
  result := public.design_budget_action('00000000-0000-4000-8000-000000000043', 'budget-test', 'reserve', '{"allowance":2100000000,"request_id":"first","stage":"analysis"}');
  assert result->>'state' = 'reserved', result::text;
  assert (result->>'max_output_tokens')::int = 606, result::text;
  result := public.design_budget_action('00000000-0000-4000-8000-000000000043', 'budget-test', 'reserve', '{"allowance":2100000000,"request_id":"overlap","stage":"analysis"}');
  assert result->>'state' = 'busy', result::text;
  result := public.design_budget_action('00000000-0000-4000-8000-000000000043', 'wrong-owner', 'inspect');
  assert result->>'state' = 'not_found';
  result := public.design_budget_action('00000000-0000-4000-8000-000000000043', 'budget-test', 'settle', '{"request_id":"first","input_tokens":1000,"cached_tokens":500,"output_tokens":100}');
  assert result->>'state' = 'settled', result::text;
  result := public.design_budget_action('00000000-0000-4000-8000-000000000043', 'budget-test', 'inspect');
  assert (result->>'spent_nano')::bigint = 2050000, result::text;
  assert result->'reservation' = 'null'::jsonb;
  result := public.design_budget_action('00000000-0000-4000-8000-000000000043', 'budget-test', 'reserve', '{"allowance":2100000000,"request_id":"second","stage":"clarification"}');
  assert (result->>'max_output_tokens')::int = 349, result::text;
  result := public.design_budget_action('00000000-0000-4000-8000-000000000043', 'budget-test', 'settle', '{"request_id":"first","input_tokens":1000,"cached_tokens":500,"output_tokens":100}');
  assert result->>'state' = 'stale';
  result := public.design_budget_action('00000000-0000-4000-8000-000000000043', 'budget-test', 'uncertain', '{"request_id":"second"}');
  assert result->>'state' = 'stopped';
  result := public.design_budget_action('00000000-0000-4000-8000-000000000043', 'budget-test', 'inspect');
  assert result->'reservation'->>'request_id' = 'second';
  assert result->>'stop_reason' = 'unknown_usage';
end $$;
rollback;
