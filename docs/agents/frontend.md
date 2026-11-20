# Public frontend

## Find the page

The current public site uses `app/layouts/artist.vue`:

| Route | Page under `app/pages/` |
| --- | --- |
| `/` (About) | `index.vue` |
| `/artworks/gallery` (Portfolio) | `artworks/gallery.vue` |
| `/artworks/:id` | `artworks/[id].vue` |
| `/exhibitions` | `exhibitions.vue` |
| `/contact` | `contact.vue` |
| `/shop-unavailable` (navigation's Shop destination) | `shop-unavailable.vue` |
| `/shop` (separate existing shop page) | `shop.vue` |

`/about`, `/collections/collections`, `/collections/:id`, `/artworks/available`,
`/commissions`, and payment pages use the older default layout. Admin pages use
`dashboard`, except login. Preserve these routes when editing the current public site.

## Choose the owner

- **Shell:** `app/layouts/artist.vue` owns navigation, footer, and content scrolling.
- **Shared presentation:** `app/assets/styles/artist.css`, imported by that layout,
  owns brand colors, heading/body size tokens, and shared page/heading/status classes.
  Its rules are contained beneath `.artistSite`.
- **Page layout:** scoped page CSS owns grids, image sizing, alignment, heading margins,
  and exceptions. `artistPage` supplies an 80rem maximum width, centered margins,
  and side gutters of 1rem below 768px and 2rem above. Exhibitions uses a narrower
  72rem maximum for its text-heavy content. Set page-specific `max-width` directly
  when needed; `--artist-page-padding` controls vertical padding.
  `artistHeading` supplies common typography;
  `artistStatus` styles empty/error messages.
- **Data:** reuse existing composables and API routes. Page-specific fetching and
  existing image-loading behavior can stay with the page.
- **Older presentation:** `app/app.vue` contains global utilities used by default/admin
  pages. Inspect callers before changing them; new public styles belong with the artist site.

For a new public page, use `layout: "artist"`, an `artistPage` section, and an
`artistHeading` h1, following `app/pages/artworks/gallery.vue`. Add navigation only
when the request calls for it. Reuse components when their behavior fits; the older
`ArtworkGallery` includes its own heading, collection details, and thumbnail layout.

## Preserve layout behavior

- Below 768px, content uses document scrolling. From 768px, the shell fills the
  viewport and its main content scrolls between the header and footer.
- Navigation uses the Menu button below 1100px, including intermediate widths.
- Shop's `--headingSize` consumes the shared heading token and also controls its
  desktop row sizing. Keep both uses synchronized.
- Artwork details and the unavailable-shop message have intentionally different
  heading sizes. Keep those page-specific choices unless the request changes them.
- Checkout remains disabled; a visual request does not enable payment processing.

## Verify the change

Use the scripts in `package.json` for lint, typecheck, unit tests, and production
build. `npm run test:e2e` builds against local fixture data without production
credentials and covers artwork browsing. For shared styles, check the affected pages
at desktop/mobile widths; for shell changes, also check navigation and scrolling at
intermediate widths.
Report pre-existing failures separately.

This guide is reference context for the design planner and executor. Their trusted
prompts explicitly request it because automatic project-document loading is disabled.
The guide grants no additional edit permissions; approved tasks and patch restrictions
still determine which files the design agent may change.
