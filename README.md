# Jamie Nelson Art

Live site: https://jamie-nelson-art.com

Jamie Nelson Art is a custom online portfolio and storefront I built for a professional artist to display and sell original artwork online. The project combines a curated gallery experience with a stripe payout so visitors can browse collections, view artwork details, and purchase available pieces directly through the site. It includes an internal dashboard with admin-only auth for the artist to edit their artworks, galleries, and manage orders.

### Payments Notice

The Stripe payment and payout flow for this project has been fully implemented. Live transaction processing is currently disabled for legal/compliance reasons, so the site operates in demonstration mode only.

## Project Goal

The aim of this project is to provide a polished, artist-focused platform that does two things well:

1. Present artwork in a clean, visual-first format that feels like a portfolio rather than a generic store.
2. Support direct sales with a simple checkout and order workflow that is easy to manage on the admin side.

The site includes public-facing gallery pages for visitors and an internal admin area for managing artwork, collections, cover images, and orders.

## Tech Stack

This project was built with:

- TypeScript
- Nuxt 4 for the SSR frontend application
- Nitro for server-side API routes and backend logic
- Supabase for authentication, PostgreSQL data storage, and file storage
- PostgreSQL as the core relational database
- Stripe for checkout, payments, and webhook-driven order processing
- Zod for form and request validation

## Key Features

- Artwork collections and individual artwork detail pages
- Image gallery support for each artwork
- Stripe Checkout integration for purchasing original artwork
- Stripe webhook handling for order creation and refund updates
- Supabase-backed image storage for artwork, gallery, and cover images
- Admin dashboard for managing inventory and orders

## Architecture Overview

The codebase is organized into a few clear layers:

- `app/` contains the Nuxt application, including pages, layouts, components, composables, and client-side utilities
- `server/api/` contains Nitro API route handlers
- `server/services/` contains backend business logic for artworks, collections, orders, dashboard stats, and storage
- `types/` contains shared application and database types
- `utils/validation/` contains validation logic for forms, images, and Stripe-related inputs

At a high level:

- The public site displays collections and artwork details
- Admin routes allow authenticated content management
- Stripe handles payment checkout
- Webhooks persist order data and update artwork availability
- Supabase stores structured data in PostgreSQL and image assets in storage buckets

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Environment

The project expects environment variables for:

- Supabase URL and API keys
- Supabase service role key
- Stripe secret key
- Stripe webhook secret
- Stripe shipping rate IDs
- Admin email

## Summary

This project was designed as a real-world artwork portfolio for a working artist, with a strong emphasis on presentation, maintainability, and direct online sales. It reflects a full-stack TypeScript approach using Nuxt, Nitro, Supabase, PostgreSQL, and Stripe to deliver both the gallery experience and the supporting commerce workflow.


### Design request verification

Apply the migrations in `supabase/migrations/` before enabling the feature. The
handoff validates the Canva user, exported design, PNG, instructions, and selected
change categories. It uploads the image to `website_designs`, then creates an
owner-scoped `design_requests` row before invoking any agent.

The `website_designs` bucket permits public reads and backend-only writes. It
accepts PNG files up to 5 MB. Files have generated UUID filenames; request rows
store their Supabase URLs. Failed initial inserts trigger image cleanup. Once a
request exists, failed analysis retains the request, image, and latest valid draft.

Each model invocation reserves and increments `design_requests.analyze_attempts`
atomically. `NUXT_MAX_ANALYZE_ATTEMPTS` defaults to 4 and counts the initial analysis
and failed calls. At the limit, a new invocation is rejected with a user-facing
error. `design_analyses` records reservations and outcomes so retries do not
consume another attempt, concurrent submissions cannot create competing plans,
and stale versions are rejected. Abandoned reservations expire after two minutes;
their attempts remain consumed. Retrying a failed call requires a new submission ID.

Successful analysis completes the reserved `design_analyses` row and assigns the
next version. Completed results are immutable. Each version
contains the plan, requirements, ambiguities, questions with stable IDs, cumulative
answer history, readiness, and the submission ID that produced it. A failed call
keeps a failed analysis row with no result or draft version. The latest draft query
only considers completed analyses. Existing analyzed records are migrated to draft version
1 without assuming that their old plans are executable.

The verification agent produces the initial draft. The clarification endpoint
loads the specified source version, sanitizes and validates ID-matched answers,
checks ownership, and reserves an attempt only if that version is still current.
It gives the clarification agent the original instructions, change categories,
latest draft, and new answers as untrusted user data, separate from the system
prompt. The model must preserve established decisions and ask only for unresolved
blocking details. Output is validated before a draft is stored. A ready plan must
contain concrete steps and targets, requirements, and no blocking ambiguities or
questions. No website changes or arbitrary code execution take place.

`POST /api/agent/clarify-requirements/:id` accepts:

```json
{
  "draft_version": 1,
  "submission_id": "a-unique-uuid-for-this-submission",
  "answers": [{ "question_id": "the-question-uuid", "answer": "The gallery page" }]
}
```

Use the same submission ID and payload when retrying a network failure. A completed
retry returns its saved version without calling the model. Changed answers require
a new ID; stale draft versions must be refreshed. Invalid answers consume no attempt.
The response includes `designRequest` and top-level `ready`, `plan`, `draft_version`,
and `attempts_remaining`. There is no GET endpoint.

The first Canva Publish sends the export, instructions, selected `changeOptions`,
and a UUID `submission_id` to `POST /api/agent/gather-requirements`. The first
submission ID is the stable request ID; identical retries return the saved analysis
without another model invocation. A changed payload under that ID is rejected.
Apply `20261104000001_initial_analysis_retries.sql` for the initial payload hash.

The complete POST result is passed to the settings frame. It displays requirements
and asks one question at a time, with Next, Back, and Submit. Submit sends ID-matched
answers to the clarification endpoint, saves a new draft, and displays the returned
JSON. This repeats until `ready=true` or the analysis attempt limit is reached.
The initial analysis counts toward the limit. A ready final attempt can be approved.

Ready responses, including an initially ready response, display a confirmation screen
with the known instructions and an Approve button. Approval calls
`POST /api/agent/execute/:id` without a request body. The endpoint authenticates the owner and
checks that the latest saved draft is ready; it currently returns
`{ success: true, requestId, draft_version }` without executing website changes.
Denial is deferred. Canva Publish only completes after explicit approval.

Responses, entered answers, and submission IDs are saved in local storage scoped to
the backend, Canva app, team, user, and design. Reload restores this UI without GET.
Tokens are decoded only for cache namespacing; the server verifies authorization.
Approval or starting a new request clears the saved workflow. If storage is blocked,
the active session remains usable; cleared storage cannot recover a saved request.
Processing is synchronous, without polling or automatic analysis on Publish retries.

`NUXT_AI_PROVIDER` defaults to `test`, requiring no AI key. Its fixed initial draft
has three questions. Vague answers such as `idk` or `not sure` cause a follow-up;
concrete test answers produce a ready plan. This is deterministic test behavior,
not real semantic analysis. Canva authentication, storage, and persistence remain
real. For a real image-capable JSON model, use `NUXT_AI_PROVIDER=chat-completions`,
`NUXT_AI_API_KEY`, and `NUXT_AI_MODEL`; `NUXT_AI_BASE_URL` defaults to
`https://api.openai.com/v1`. The model timeout is 45 seconds and Canva's request
timeout is 90 seconds. Missing live-model configuration does not fall back to test
output. Both agents accept the provider-neutral `AiModel` interface.

Run `npm run test:handoff` for isolated tests, and `npm run test:drafts:integration`
for the real local Supabase transaction checks (requires `.env` and applied
migrations). Integration checks create temporary records and clean them up.

For local Canva testing without discovering your user ID first, set
`NUXT_CANVA_ALLOW_UNLISTED_LOCAL_USERS=true` and leave
`NUXT_CANVA_ALLOWED_USER_IDS` empty or set it to the placeholder
`REPLACE_WITH_YOUR_CANVA_USER_ID`. This only takes effect in development mode,
with `NUXT_AI_PROVIDER=test`, and when Supabase points to a loopback host. Canva JWT signatures,
app identity, expiry and claims are still verified, and each saved request remains
owned by the verified user. Production, real model providers, hosted Supabase databases,
and explicitly configured allowlists retain normal allowlist checks.
