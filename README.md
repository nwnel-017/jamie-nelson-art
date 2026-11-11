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
