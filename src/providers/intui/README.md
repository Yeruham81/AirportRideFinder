# Isolated Intui.travel provider integration

This is **development code** with a disabled-by-default **read-only preview**, not
an active booking provider. It is NOT in the four-provider demonstration registry.
The separate `/intui-preview` route calls a server function that only searches
when ALL three environment variables are set on the hosting server:
`INTUI_PREVIEW_ENABLED=true`, `INTUI_LIVE_ENABLED=true`, and `INTUI_API_KEY`.
The GitHub Actions secret is NOT automatically a hosting-server secret.
Do not activate the preview publicly without access control and rate limiting.
Two authorized read-only GitHub Actions diagnostics were completed, with no
booking, payment or deployment. The one-shot workflow is disabled.

## Implemented

- `request.ts`: validated one-way GEO request fields, coordinates, adults,
  local pickup datetime (5-minute increments), USD/EUR and English.
- `response.ts`: conservative metadata diagnostics and explicit error statuses.
  A 05-Nov-2026 shape-only diagnostic confirmed
  `response.<dynamic-key>.travelling` (102 candidate entries) and numeric
  `pricing.allprice.USD`.
- `normalize.ts`: strictly validates private-transfer prices, known vehicle
  classes, passengers, luggage and currency; returns non-actionable live offers
  while fee inclusion remains unknown. Malformed and non-comparable rows are
  omitted, not guessed.
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
configure the API key and preview flags separately in the hosting provider's
secure server environment. No booking URLs, raw API payloads, or keys are
serialized to the browser.

## Before activation

1. The official Travelpayouts article defines `pricing.allprice` as the total
   transfer price. Extra charges and fee inclusion vary: the UI marks fee
   inclusion **unknown**, never promises an all-inclusive final total.
2. Secure the preview behind access controls and rate limits before enabling
   it on a hosted server. Set deployment-only environment flags intentionally.
3. Confirm how Travelpayouts affiliate links are generated for the temporary
   `info.intuiUrlOrderSingle` URLs. Never enable raw/untracked redirects.
4. When partner attribution is ready, plan a separate public live-mode UX,
   without mixing fictional providers and real Intui results.
5. Never log keys or raw API request/response bodies. No booking/payment calls.

Official reference:
https://support.travelpayouts.com/hc/en-us/articles/360016804119-intui-travel-API
