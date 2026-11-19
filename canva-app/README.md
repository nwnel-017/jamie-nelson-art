# Canva Portfolio App

This canva integration is part of a new feature I am currently implementing. Since the artist often likes to create designs in canva to regularly update the UI, this is an agentic feature that allows the artist to export an image directly from canva, and have the design updated by an AI agent.

Submit a Canva design with instructions for changes to the portfolio website. The app analyzes the design, asks clarifying questions, and saves a plan for review. Once the clarifying questions are answered and the plan is established, the finalized plan of what will be changed is shown to the artist. After approval, the instructions are handed off to a sandboxed agent to complete and open a PR.

Work in progress: it does not yet apply changes to the website.

## Test

From `canva-app/`:

```bash
npm test -- --runInBand
npm run lint:check
npm run build
```

From the repository root:

```bash
npm test
npm run check
npm run test:integration
```

Integration tests require local Supabase running, with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured.

To preview locally, run these in separate terminals from the repository root with the backend and Canva `.env` files configured:

```bash
npm run dev
npm run canva
```

### Approving a ready draft

Ready drafts offer Approve, which sends a bodyless POST to
`/api/agent/execute/:id`. An accepted response queues technical planning and
implementation; Canva confirms that the agent is working and asks the admin to
watch their email inbox. Publish completes after acceptance and clears the saved
workflow.

The completion notification workflow sends the configured admin either:

- An approval email with the verified commit's Vercel preview and PR links.
- A failure email asking them to contact the developer, including a request reference.

Repair handoffs do not send intermediate emails. Preview lookup waits up to five
minutes. Notification retries preserve their selected outcome in GitHub commit
statuses and reuse Resend idempotency keys. Failed sends remain visible in the
notification workflow and can be retried by rerunning it. Nothing merges automatically.

Notifications require the workflow on the default branch, repository secrets
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `ADMIN_EMAIL`, and a successful preview
reported through GitHub deployments. `DESIGN_PREVIEW_ENVIRONMENT` defaults to
`Preview`. Set `DESIGN_WORKFLOW_REF` to the backend's configured planning workflow
branch if it differs from `master`.
