# Isolated Intui.travel provider integration

This is **development code** with a disabled-by-default **read-only preview**, not
an active booking provider. It is NOT in the four-provider demonstration registry.
The separate `/intui-preview` route calls a server function that only searches
when ALL three environment variables are set on the hosting server:
`INTUI_PREVIEW_ENABLED=true`, `INTUI_LIVE_ENABLED=true`, and `INTUI_API_KEY`.
**AND** a valid, short-lived, signed preview session is required for every
search request. Login requires `INTUI_PREVIEW_ACCESS_PASSWORD` (at least 24
characters) and `INTUI_PREVIEW_SESSION_SECRET` (at least 32 characters), which
must be different strong random secrets. Use secure hosting secrets, not GitHub
source code or a browser-visible `VITE_*` environment variable.
The GitHub Actions secret is NOT automatically a hosting-server secret.
Login is protected by an in-process attempt limit (5 per 5 minutes), and
requests by a per-session limit (12 per hour) and per-process budget (100 per
hour). These limits are **per worker instance**, not global across serverless
replicas, and can reset on restart. **Public deployment also needs a
hosting-provider WAF/shared distributed limiter and access restrictions**.
The signed `__Host-arf-intui-preview` session cookie is HttpOnly, Secure,
SameSite=Strict, and expires after 30 minutes. Authentication is enforced by
the server function itself, not merely by a UI route guard.
Authorized, single-request GitHub Actions diagnostics and a full adapter
smoke test were completed, with no booking, payment or deployment. Temporary
trigger workflows were removed afterward; the adapter smoke script remains
disabled by default and requires an explicit server-side diagnostic flag.

## Implemented

- `request.ts`: validated one-way GEO request fields, coordinates, adults,
  local pickup datetime (5-minute increments), USD/EUR and English.
- `response.ts`: conservative metadata diagnostics and explicit error statuses.
  A 05-Nov-2026 shape-only diagnostic confirmed
  `response.<dynamic-key>.travelling` (102 candidate entries), **opaque string**
  `info.productid`, and numeric `pricing.allprice.USD`.
- `normalize.ts`: strictly validates private-transfer prices, known vehicle
  classes, passengers, luggage and currency; returns non-actionable live offers
  while fee inclusion remains unknown. Malformed and non-comparable rows are
  omitted, not guessed. A controlled, single-request integration test on
  05-Nov-2026 yielded **95 normalized, non-actionable offers out of 102** on
  Heathrow → central London for 2 passengers and 2 bags. Cheapest quote in
  that test was **USD 111.35** (time-specific, not a guaranteed current price).
- `client.server.ts`: isolated gated server-only HTTPS POST JSON transport,
  following the official PHP example which places the key in the JSON body,
  with HTTP/error/timeout handling and no retries. It strips provider raw
  data, keys and booking URLs from returned diagnostic statuses.
- `adapter.server.ts`: opt-in ProviderAdapter implementation, still not
  included in `providers/registry.ts`; all provider calls stay server-only.
- `src/search/intui-preview.functions.ts`: gated server-side read-only search.
- `src/routes/intui-preview.tsx`: separate noindex preview page showing live
  quoted prices ONLY, without sample data or booking links.
- `src/test/intui.test.ts`: mocked transport and parser regression tests,
  requiring no external API calls.


## Read-only preview URL (only after secured server configuration)

The route is intentionally **not linked from the public site**. When enabled on
an access-controlled server, a sample search can be opened at:

`/intui-preview?from=lhr&to=central-london&date=2026-12-15&time=10%3A05&pax=2&bags=2`

Use a *future* local pickup date. If all preview flags are not present, this
route displays a disabled/unconfigured message and does not call Intui.

The GitHub Actions secret is scoped to CI only. To try the preview on hosting,
configure **five** variables separately in the hosting provider's secure server
environment: `INTUI_API_KEY`, `INTUI_LIVE_ENABLED=true`,
`INTUI_PREVIEW_ENABLED=true`, `INTUI_PREVIEW_ACCESS_PASSWORD`, and
`INTUI_PREVIEW_SESSION_SECRET`. The `.env.example` file contains only
non-secret placeholders. Use HTTPS; all authentication must remain server-side.
Do not turn on flags before configuring the perimeter access policy (WAF or
restricted host), a distributed request quota, and private `Cache-Control` for
all preview RPCs. No booking URLs, raw API payloads, or keys are serialized to
the browser.

## Diagnosing a failed hosted preview

On a successful password login, the preview can still fail if the hosting
runtime cannot reach Intui, the provider rejects its key or parameters, a
request times out, or no quotes pass strict normalization. A single generic
error message did not distinguish these cases.

The authenticated `/intui-preview` page now displays **only an allowlisted,
non-sensitive diagnostic code** such as `provider_unreachable`,
`provider_unauthorized`, `provider_timeout`, `invalid_provider_response`,
or `no_eligible_offers`, and offers a manual retry. These codes do not
contain provider response values, credentials, links or client details.

If the error persists, record that diagnostic code and the requested route/
date/time. Check the code first before modifying API credentials or making
additional calls. No debugging route or public logging of the API response
is introduced.

## Before activation

1. The official Travelpayouts article defines `pricing.allprice` as the total
   transfer price. Extra charges and fee inclusion vary: the UI marks fee
   inclusion **unknown**, never promises an all-inclusive final total.
2. Application-level password login, signed 30-minute sessions and bounded
   per-instance rate limits are implemented. Configure hosting-side HTTPS,
   external access control and shared rate limiting before enabling it publicly.
3. Confirm how Travelpayouts affiliate links are generated for the temporary
   `info.intuiUrlOrderSingle` URLs. Never enable raw/untracked redirects.
4. When partner attribution is ready, plan a separate public live-mode UX,
   without mixing fictional providers and real Intui results.
5. Never log keys or raw API request/response bodies. No booking/payment calls.

Official reference:
https://support.travelpayouts.com/hc/en-us/articles/360016804119-intui-travel-API
