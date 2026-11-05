# Isolated Intui.travel provider integration

This is **development code**, not a live booking provider. It is not imported by
any site route, public endpoint, or the four-provider demonstration registry.
It makes no network calls unless a separate server-side caller invokes the
transport with both `INTUI_LIVE_ENABLED=true` and a secure `INTUI_API_KEY`.
Neither variable is stored in source code. No API calls have been made in
development, and no site deployment has been requested.

## Implemented

- `request.ts`: validated one-way GEO request fields, coordinates, adults,
  local pickup datetime (5-minute increments), USD/EUR and English.
- `response.ts`: conservative metadata diagnostics and explicit error
  statuses. All real nonempty replies currently fail closed and yield **zero**
  price offers, because the exact `pricing.allprice` structure and currency
  semantics have not been verified against a real sample.
- `client.server.ts`: isolated gated server-only HTTPS POST JSON transport,
  following the official PHP example which places the key in the JSON body,
  with HTTP/error/timeout handling and no retries. It strips provider raw
  data, keys and booking URLs from returned diagnostic statuses.
- `adapter.server.ts`: disabled ProviderAdapter scaffold, intentionally not
  included in `providers/registry.ts`.
- `src/test/intui.test.ts`: mocked transport and parser regression tests,
  requiring no external API calls.

## Before activation

1. Independently verify the exact `pricing.allprice` JSON structure and the
   total amount/currency for private, one-way offers.
2. Implement tested normalized offers without assuming taxes, vehicle
   capacities, cancellation terms or expiry.
3. Confirm how Travelpayouts affiliate links are generated for the temporary
   `info.intuiUrlOrderSingle` URLs. Never enable raw/untracked redirects.
4. Create a secure server-side search route and display **only real results**
   when live mode is explicitly enabled; do not mix them with sample offers.
5. Verify with one authorized read-only API call in a controlled environment.
   Never log API keys or raw request/response bodies.

Official reference:
https://support.travelpayouts.com/hc/en-us/articles/360016804119-intui-travel-API
