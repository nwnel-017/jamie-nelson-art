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

## Tests

- `npm test`: HTTP route integration tests with simulated Supabase and Stripe boundaries. Exercises real artwork read services and real payment order processing; admin write tests exercise authorization, form handling, and the real save services against a simulated Supabase HTTP boundary.
- `npm run test:e2e`: Chromium visits the portfolio and artwork details using a local Supabase HTTP fixture, including image loading. Install Chromium with `npx playwright install chromium` first. No payment browser tests.
- `npm run test:rls`: real Supabase Auth and database table policy tests. Requires a disposable local Supabase stack. This suite creates test users and rows and removes them afterward; it rejects remote URLs.

For RLS tests, start Docker and run `supabase start`, then export the local credentials:

```sh
eval "$(supabase status -o env)"
TEST_SUPABASE_URL="$API_URL" TEST_SUPABASE_ANON_KEY="$ANON_KEY" TEST_SUPABASE_SERVICE_KEY="$SERVICE_ROLE_KEY" npm run test:rls
```

Use `TEST_ADMIN_EMAIL` if your local admin policy expects a specific email. The default is `admin@example.test`; it must not already exist in local Auth. The suite intentionally asserts anonymous read access to public content, anonymous write denial, private order/webhook data, and signed-in admin content management. Bucket policies and separate non-admin accounts are outside the current scope.

GitHub Actions runs integration tests, the production build, browser tests, and a separate local Supabase RLS job. No live Stripe or hosted Supabase credentials are required.

The unique Stripe event-ID migration intentionally stops if existing webhook records contain duplicate IDs. Before applying it to a shared database, inspect duplicates with `select event_id, count(*) from public.webhook_event group by event_id having count(*) > 1;` and reconcile them. It does not silently delete payment history.
