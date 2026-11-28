# Analysis and clarification budget (#43)

- Configure server-only `AI_DESIGN_BUDGET_USD` as a positive decimal USD amount, at most nine fractional digits. Missing, zero, negative, exponent notation and unsafe integer amounts stop paid work.
- Configure `NUXT_AI_PROVIDER=responses`, `NUXT_AI_MODEL=gpt-4.1-2025-04-14`, the existing server-only API key, and the official OpenAI base URL. Other paid routes stop before inference. The existing fixed `test` model is unpaid.
- The existing initial submission UUID is the canonical update ID. Initial retries keep it; clarification uses the owned request ID. Budget RPCs recheck the authenticated owner. A new update has a new allowance.
- One `design_budgets` row stores nanodollars, stage totals, stop reason and one hold. No completed-call history or model content is stored. `design_budget_action(..., 'inspect')` is the internal inspection boundary; it includes the held amount and stage totals. Only service_role can invoke it.
- Admission and settlement lock that row. Independent updates remain independent. An overlap returns conflict without changing the active hold. Settlement uses its matching request ID; duplicates and stale IDs cannot clear a newer hold.
- Uncertain responses, failed HTTP requests, redirects, malformed usage, database failures and disconnects never trigger automatic inference retries. A persisted hold never expires. After a process crash, an unresolved hold blocks admission indefinitely; developer intervention is required. Missing database connectivity prevents inference even when the stop cannot itself be saved.
- Budget stops preserve the existing immutable draft, retain the update identity, return `BUDGET_STOP` with developer-contact guidance, appear on request reload and prevent approval/implementation dispatch. Clarification UI disables further work for this outcome.

## Reviewed charge bound

Reviewed against official documentation on 2026-11-28:

- [GPT-4.1 model](https://developers.openai.com/api/docs/models/gpt-4.1): snapshot `gpt-4.1-2025-04-14`, 1,047,576-token context, image/text input, $2/M input, $0.50/M cached input, $8/M output. The model is marked deprecated; availability on a particular account is untested.
- [Responses request controls](https://developers.openai.com/api/reference/resources/responses/methods/create): `service_tier=default` requests standard pricing; `max_output_tokens` bounds generated tokens including reasoning. Responses report the actual tier and token usage. A different returned tier is treated as uncertain.
- [Vision input accounting](https://developers.openai.com/api/docs/guides/images-vision): GPT-4.1 uses token-based image billing at its input rate. Images consume model context. This adapter does not support models with image-token multipliers or separate image generation fees.

The service reserves the entire possible input context at the uncached rate: **$2.095152**, plus capped output at $0.000008/token. This deliberately conservative bound avoids counting calls, counting fees, mutable remote-image counting discrepancies, tokenizer estimates and cache-hit assumptions. Output is capped to the smaller of 8,192 tokens and what fits after that input hold. Fewer than 16 output tokens stops admission. For example $2.10 initially permits 606 output tokens. This is a per-request bound, not an estimate of completing the update. Small allowances below $2.095280 cannot start a paid call.

Requests have a closed shape: official HTTPS Responses endpoint, one request, no redirects, no streaming/background/state references, no hosted tools, no batch/flex/priority processing, no optional subagents. Nothing from model output can select a tool, model, price or tier. Settlement prices uncached input plus cached input plus total output exactly once. Incomplete responses with authoritative valid usage are charged before reporting an analysis failure.

The full hold remains after ambiguous errors even if the server may finish generating after the client disconnects. We assume neither a refund nor server cancellation nor upstream idempotency. Provider documentation supports the context/output bounds and standard token rates; offline tests cannot establish invoice behavior or prove provider compliance with those bounds. No claim is made that client abort cancels billing, that error responses are free, or that an idempotency key prevents repeat charges. Final #42 acceptance still needs provider-side evidence about failed/disconnected request billing and actual worker isolation. No paid call was made for this slice.

## Verification and local reproduction

- `npm test`, `npm run lint`, `npm run typecheck` cover the backend.
- `npm run test:integration -- tests/integration/design-budget.test.ts` uses local Supabase, or a disposable local PostgreSQL/PostgREST instance via `BUDGET_POSTGREST_URL`. The latter removes the Supabase URL prefix and test authorization header at the database transport boundary; it never fakes SQL or RPC results. It must run with a local service_role matching Supabase's BYPASSRLS permissions.
- Apply the existing design_requests, versioned design drafts and analysis-response migrations, plus the new budget migration, to that disposable instance. `psql ... -f tests/database/design-budget.sql` independently verifies the transaction interface and rolls back test data.
- `npm run test:integration -- tests/integration/design-workflow.test.ts` covers initial authenticated gather and clarification through the same budget with real local Supabase storage and fake inference. This full storage route requires Docker/Supabase; it was not executed in this environment because Docker is unavailable.
- The private verification instance used PostgreSQL 15.18 and PostgREST 16.6. The repo's full Supabase stack targets PostgreSQL 17. This is a real PostgreSQL transaction/HTTP test, not a complete Supabase 17 acceptance run.
- Worker transport, bypass isolation, workflow completion and partial implementation artifact preservation belong to subsequent tickets #44–#46; this slice does not establish the complete feature-wide guarantee.
