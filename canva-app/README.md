# Portfolio Export — project setup

This directory contains the Canva Content Publisher app. The Nuxt portfolio and its backend remain in the repository root.

Development app: https://www.canva.com/developers/app/AAHOGIFETu8

Use Node.js 24 and npm 11 in this directory. With nvm installed:

```bash
cd canva-app
nvm install
nvm use
npm install
# On a fresh checkout, copy .env.example to .env and set CANVA_APP_ID.
canva login
canva apps start --preview
```

The CLI opens the publisher preview in Canva and serves the frontend at http://localhost:8080. Keep the command running while previewing. Local `.env` files are ignored by Git; `.env.example` contains placeholders for a fresh checkout.

The publisher collects required AI instructions (up to 4,000 characters), previews one selected design page as a PNG, and sends `{ submission_id, source: "canva", instructions, changeOptions, outputMedia }` to `POST /api/agent/gather-requirements`. Canva's publish button submits the handoff; no separate export dialog is needed.

Start the Nuxt backend in a second terminal from the repository root with `npm run dev` (port 3000). Set `CANVA_BACKEND_HOST=http://localhost:3000` in this directory's `.env`, then restart `canva apps start --preview` after changing it. For a deployed backend, use its HTTPS base URL without `/api`.

The endpoint verifies Canva user and design JWTs, checks the user allowlist, validates the request and instructions, downloads the PNG through a protected connection, and fully decodes it. After every check passes it logs `success` and returns `{ "message": "success" }`. The image is discarded; no design is stored and no agent runs. Failed, timed-out, or unconfirmed requests show Canva's publishing error and can be retried.

CORS is limited to this app's Canva origin and this endpoint, including OPTIONS preflight. For a different Canva app, set `NUXT_CANVA_APP_ORIGIN=https://app-YOUR_LOWERCASE_APP_ID.canva-apps.com` on the Nuxt backend. The request includes a Canva user JWT in its Authorization header. CORS allows that header; authorization is separately enforced using a configured Canva user ID allowlist.


## References

- [Content Publisher guide](https://www.canva.dev/docs/apps/intents/content-publisher/implementation-guide/)
- [Canva request verification](https://www.canva.dev/docs/apps/verifying-http-requests/)

## Backend validation setup

Set these variables in the **Nuxt backend** environment (repository root), then restart it:

```dotenv
NUXT_CANVA_APP_ID=AAHOGIFETu8
NUXT_CANVA_ALLOWED_USER_IDS=YOUR_VERIFIED_CANVA_USER_ID
NUXT_CANVA_EXPORT_HOSTS=export-download.canva.com
```

Multiple allowed user IDs or exact export hostnames can be comma-separated. The user list defaults to empty and fails closed with HTTP 503 until configured. An authenticated user outside the list gets HTTP 403. The app ID is not an API secret. No manually generated Canva API token is required: the frontend obtains a fresh user token through the Canva SDK.

To discover your ID, open the Canva publisher preview, attempt a submission, and inspect that request's Authorization header in browser developer tools. Save only its Bearer token to a private local file, then run `npm run --silent canva:user-id < /path/to/private-token-file` from the repository root. This verifies the token with Canva and prints only its user ID. Set that ID in `NUXT_CANVA_ALLOWED_USER_IDS`. Do not paste tokens into chats or commit the file; delete it after use.

The downloader initially allows only the exact `export-download.canva.com` host, with HTTPS and no redirects. If a real Canva export uses a different host, verify that hostname is Canva-controlled before adding the exact name to `NUXT_CANVA_EXPORT_HOSTS`. Private, loopback, link-local and reserved IPs are rejected at connection-time DNS resolution, including mixed public/private results. User JWTs are never forwarded to the download host.

Limits: 64 KiB JSON body; one PNG and one page; 4,000 instruction characters; 5 MiB downloaded bytes; 10,000 pixels per dimension and 25 million total pixels. Encoded downloads, animated PNGs, corrupt PNGs and trailing data are rejected. Download deadline is 8 seconds; decoded dimensions must agree with the export metadata. A design token proves design identity, not a cryptographic binding to the supplied download URL, bytes, title or instructions.

Instruction checks reject blank/oversized text, hidden controls, common role override delimiters, secret extraction and shell execution requests. This is conservative screening, not a guarantee against prompt injection; it can reject legitimate wording and can miss attacks. All accepted instructions, image text/OCR and metadata remain untrusted data. Any future agent must enforce its own fixed instructions, tool restrictions and authorization rather than executing submitted text. After validation and persistence, the backend invokes the configured analysis model to produce requirements and clarification questions.

Errors use HTTP 400 (payload), 401 (tokens), 403 (user not allowed), 413 (limits), 415 (unsupported format), 422 (instructions or image), 502/504 (download failure/timeout), or 503 (access not configured). Responses do not include JWTs, signed export URLs or internal transport errors.

Run backend checks with `npm run test:handoff` from the root. Run frontend checks with `npm test -- --runInBand`, `npm run lint:check`, and `canva apps build` from this directory. The complete portfolio also requires its existing Supabase/Stripe environment; a local placeholder Stripe test key can be used for this handoff-only test, which does not call Stripe.

### Clarification banner message

After successful analysis, the publisher returns a recoverable response with the
`design_clarification_required` localized message ID. The clarification panel also
shows the submission message directly.

Run `npm run build` in `canva-app`, then upload `dist/messages_en.json` in the
Canva Developer Portal under **Inside Canva → Code upload → Translations**.
Canva requires the uploaded message bundle to replace its generic publish error
banner with the custom submission message.

Clarification rounds POST answers to `/api/agent/clarify-requirements/:id` and
render the returned draft directly. Ready drafts show the final requirements,
plan, and answer history for review. Ready drafts can be approved as described
below. Publish completes after approval is accepted.
There are no GET/polling requests. The latest response, answer edits, and retry IDs
are cached in local storage scoped to the Canva app, user, team, design, and backend.
The saved workflow is cleared on approval or when starting a new request.

### Approving a ready draft

Ready drafts offer Approve, which sends a bodyless POST to
`/api/agent/execute/:id`. An accepted response queues technical planning and
implementation; Canva confirms that a pull request will be prepared. Publish
completes after acceptance and the saved workflow is cleared. This stage does not
automatically verify, repair, merge, or send email about the generated PR.
