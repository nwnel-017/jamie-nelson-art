# Tests

## Find design-change coverage

| Path                                            | Responsibility                                                                                                                | Command                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `unit/design/`                                  | Input policies, model selection/output, worker identity, dispatch contracts, verification decisions                           | `npm test -- tests/unit/design`                        |
| `integration/design/local/`                     | Services with SDK/HTTP adapters, image decoding, worker scripts, real Git publication, verification and notification handoffs | `npm test -- tests/integration/design/local`           |
| `integration/design/supabase/`                  | Requirements transactions, ownership, concurrency, approved job persistence and notification state against local Supabase     | `npm run test:integration`                             |
| `integration/design/browser/`                   | Browser MCP navigation, approved assets and trustworthy capture evidence                                                      | `npm run test:e2e -- tests/integration/design/browser` |
| `e2e/requirements.spec.ts`                      | Artist submits a design, clarifies requirements and approves implementation through the Canva UI and backend                  | `npm run test:requirements:e2e`                        |
| `../canva-app/src/` (`*.test.tsx`, `*.test.ts`) | Canva component behavior and SDK adapters                                                                                     | `npm --prefix canva-app test -- --runInBand`           |

- `npm test` runs unit and local integration tests; it needs no database.
- Supabase and requirements browser suites need the local Supabase stack and its migrations.
- The default Playwright command runs visitor journeys and browser-tool integrations against the built app. Requirements browser tests use their separate config.
- Publication/repair tests run real Git commands against a temporary local remote and record GitHub requests. They do not contact GitHub or run a live model.
- Stale-repair guard coverage requires Bash 4.3 or newer. Those cases explicitly skip under older Bash; they must pass on the Linux CI runner.

Use a file name for one responsibility, then name each test after its observable result. Keep pure policy cases in unit tests, collaborating adapters in integration tests, and artist/visitor journeys in end-to-end tests.
