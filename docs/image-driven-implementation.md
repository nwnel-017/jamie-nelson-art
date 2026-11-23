# Image-driven implementation

Implementation of the agreed design flow. Canonical spec: [issue #28](https://github.com/nwnel-017/jamie-nelson-art/issues/28).

## Flow

1. Analyze the design image and clarify requirements with the artist.
2. Approve the requirements and answers as the scope.
3. Supply the actual image and approved scope to the implementation agent.
4. Inspect relevant code, make a short plan, and implement presentation changes.
5. Open or update a PR through the existing isolated publishing step.
6. Run automated checks, code review, and browser inspection of the local app.
7. Repair failures up to two times, verifying each updated commit again.
8. Report verification for the current PR commit. A human merges; user-facing completion semantics remain unchanged until issue #27.

## Rules

- Remove separate technical instructions generation and its output artifact.
- Implementation, review, and repair receive the same approved image, requirements, and answers.
- Deliver image pixels through supported image input; a URL in prompt text is insufficient.
- Stop if the agent cannot view the image.
- Explicit approved requirements override conflicting image details.
- Use image details only within approved scope.
- Verify a viewport matching the supplied reference.
- Defer desktop-only responsive adaptation and new mobile verification behavior to [issue #26](https://github.com/nwnel-017/jamie-nelson-art/issues/26).
- Compare meaningful layout, spacing, typography, color, and imagery differences; allow minor rendering differences.
- Render locally with representative test artwork data.
- Require a report of inspected pages and observations accessible from the PR. Saved screenshots are optional.
- Rendering failure means verification is incomplete and requires human attention.
- Keep presentation-only patch restrictions and existing privileged publishing boundaries.
- The visual implementation agent must never create or update Supabase migrations. Escalate requests requiring database changes to a human.
- Stop and report unresolved product decisions or changes outside permitted scope.
- Keep routine implementation choices with the agent.
- Defer explicit restart controls and a distinct verified no-change outcome to [issue #27](https://github.com/nwnel-017/jamie-nelson-art/issues/27).
- No production jobs exist; replace the old flow without historical-job compatibility machinery.

## Implementation plan

- Replace planning/execution prompts and artifacts with approved request context plus the actual image.
- Carry that context through implementation, PR review, and repairs.
- Simplify workflow dependencies and remove unused technical-output schemas and validation.
- Make only lifecycle/storage/API changes necessary to remove technical planning; preserve existing duplicate-approval protections and user-facing status behavior.
- Defer accurate progress, completion semantics, PR links, and restart controls to issue #27. Existing status may report completion before verification finishes.
- Give the reviewer Playwright MCP browser tools to inspect the fixture-backed local app at the reference viewport; do not add a dedicated screenshot capture pipeline.
- Attach the reference image to review and require browser inspection. Retain its inspection report and optional screenshots for human review.
- Tie verification to the exact current commit; an updated PR must be verified again.
- Update focused tests for image delivery/failure, approved scope, direct implementation handoff, repairs, and rendered verification.
- Run relevant tests, lint, typecheck, and production build before opening a PR.

## Implementation details to verify

- Download the approved image from its public Supabase bucket URL before starting Codex, validate it, and attach the local file using `codex exec --image` through the action's `codex-args`.
- Use the same downloaded image for implementation, review, and repair. Do not depend on the agent fetching a URL from prompt text.
- Choose the smallest rendering setup matching existing test infrastructure.
- Treat missing rendering prerequisites as a visible blocker, never a passing check.

## Image input evidence

- [Codex CLI reference](https://developers.openai.com/codex/cli/reference/): `--image` attaches image files to the prompt.
- [Codex exec source](https://github.com/openai/codex/blob/main/codex-rs/exec/src/cli.rs): image inputs are file paths.
- [Pinned Codex action inputs](https://github.com/openai/codex-action/blob/bdf19a4a223ec2549a3e2274a0cf61556bc07675/action.yml): `codex-args` forwards extra arguments to `codex exec`; `codex-version` is optional.
- Recommendation: retain the public bucket as storage, download once in workflow preparation, and attach the downloaded image. A URL included in prompt text is not a documented image attachment mechanism. This recommendation is based on documentation and source inspection.

## Runtime and verification

- The existing workflow filename and backend job names remain stable to preserve OIDC and webhook bindings.
- Approved context is uploaded by the isolated claim job, retained for 30 days, and passed by originating run ID through repairs. Expired or missing context fails closed.
- Generated app code builds and runs inside a container without host mounts or reviewer credentials, on an internal network with isolated gateway mode (no host bridge address), exposed through a trusted fixed-port proxy. Chromium runs in a separate credential-free container sharing only the app network namespace; the trusted host MCP wrapper controls it over a fixed debugger proxy. It uses local fixture data and the reference viewport. It must visually inspect affected pages, not only read source or accessibility snapshots.
- A trusted browser wrapper captures from the actual browser page, records its URL and reviewed commit, and rejects navigation during capture. It never derives page identity from console or tool-result text, and does not store image pixels in the audit. Reported pages without this evidence cannot pass. Incomplete browser inspection fails review and requires human attention. Successful reports must identify the reviewed commit and inspected local URLs.
- Inspection reports and optional browser screenshots are available from a PR comment linking the verification run.
- The new migration only removes the obsolete technical output requirement. It does not introduce progress states; completed still does not mean a verified PR.
- Local checks: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:integration` against local Supabase, and `npm run test:e2e`. The browser smoke test invokes Playwright MCP directly and never calls Codex.
