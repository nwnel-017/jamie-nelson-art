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
