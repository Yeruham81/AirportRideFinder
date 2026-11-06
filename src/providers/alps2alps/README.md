# Alps2Alps / Amitours API integration — isolated sandbox

**Status:** development-only, read-only **preview**, not a production affiliate
or booking integration. AirportRideFinder has no public live comparison engine;
the public `/search` route remains a fictional four-provider demonstration.
Alps2Alps is NOT added to `src/providers/registry.ts`.

## Verified vendor technical contract

Official B2B API v2: https://www.amitours.com/developer
- Fixed development host: `https://sandbox.amitours.com/api/v2`. No
  production fallback and no arbitrary host override.
- `POST /token` with `api_key` and `api_secret` server-side produces a
  one-day Bearer token. For this diagnostic, request a fresh token only after
  authorized user action. Neither credentials nor token reach the browser.
- `GET /vehicles` supplies official vehicle name and max passenger capacity
  for each `vehicle_type_id`. Missing or invalid metadata remains unknown.
- `POST /transfer` creates a **sandbox transfer request with offer prices**.
  This is not a booking. **Never call** `/booking`,
  `/shuttle-booking` or payment/checkout endpoints.
- Returned B2B prices are in EUR. Show only `requested-*` offers matching
  the requested pickup time; skip `off_peak-*` alternatives rather than
  presenting them as the same service.
- `POST /transfer` is not a purely stateless quotation endpoint: it creates
  a transfer *request record*, which is why our UI calls it only after the
  user explicitly selects **Search sandbox quotes**.
- Provider referral mechanism and affiliate commission attribution from
  API-generated links remain **unverified**. Affiliate promo code
  `AIRPORTRIDEFINDER` is intentionally NOT sent to these endpoints
  or added to an unsupported redirect.
- An unauthenticated Public Booking API also exists at
  https://www.alps2alps.com/developers/public-api/ and returns
  `quote_url` and per-vehicle `booking_url` values. We do not use
  these links until the provider confirms affiliate attribution and
  price-comparison permissions.

## Setup in hosting configuration

Required existing server-only hosting secrets:
- `ALPS2ALPS_SANDBOX_API_KEY`
- `ALPS2ALPS_SANDBOX_API_SECRET`
- `INTUI_PREVIEW_ACCESS_PASSWORD` (existing strong private preview password)
- `INTUI_PREVIEW_SESSION_SECRET` (existing strong signing secret)

One **additional opt-in** variable:
- `ALPS2ALPS_SANDBOX_PREVIEW_ENABLED=true`

All variables belong in hosting-side Secrets, not `VITE_*` and not GitHub
source. When the flag is not exactly `true`, sandbox previews do not call
the provider, even if credentials exist. Do not send secrets to ChatGPT.
Do not rely on GitHub Actions secrets being available in Lovable or vice versa.

Open `/alps-preview` directly. The route is noindex and unlinked from the
demo. It requires a password and signed HttpOnly secure same-site cookie,
with a 30-minute session and bounded per-process/per-session rate limits.
The initial loader **does not make any provider API request**. After login,
press Search sandbox quotes for a single controlled, one-way
Geneva Airport (`airport-1`) → Chamonix (`resort-11`) search. Dates/times
are validated in Geneva local time and 1–16 adults accepted.

The sandbox previews are not production customer prices. No booking CTA,
no raw API body, tracking link, token, or credential is serialized to the
browser. Do not open this route to a public audience without a hosting-side
Access/WAF gate and distributed rate limiting in front of the server
functions. Existing in-memory limits are **per worker only**.

## Hosted sandbox connectivity diagnostics (6 Nov 2026)

The first Lovable-hosted sandbox search returned only `network_error`.
The previous transport merged auth and quote network failures into one
status. The private preview now reports a fixed, non-sensitive stage:
`token` for POST /token, `transfer` for POST /transfer, or a separate
vehicle-catalog warning when GET /vehicles is unreachable. Status/stage
are allowlisted; raw exception messages and request headers are never
returned to the client.

An independent, **no-credentials** GitHub Actions probe confirmed that
`sandbox.amitours.com` resolved in DNS, connected with verified TLS and
responded HTTP 405 to HEAD on `/api/v2/token` (expected for a POST-only
endpoint). This does **not** prove accessibility from the Lovable-hosted
Cloudflare runtime; it narrows the question to runtime-dependent connectivity
or a specific API request stage. The temporary diagnostic workflow was
deleted before merging.

After deployment, trigger **one** search again and record the fixed stage
shown in the private preview. If stage=token and status=network_error,
investigate outbound Cloudflare connections, origin IP restrictions or TLS
compatibility; do not rotate working secrets without evidence. If the failure
occurs only on transfer, investigate endpoint-specific access policies.
Do not copy private credentials, raw request/response bodies or bearer tokens.

## Public GET quote fallback (private diagnostic only)

We verified on 6 Nov 2026, using **no secrets** and a separate GitHub
Actions runner, that:
- `POST https://sandbox.amitours.com/api/v2/token` with intentionally invalid
  dummy credentials returned HTTP **400** with successful TLS (no transport
  error). This establishes that the endpoint is reachable from the GitHub
  runner, **not** from the Lovable/Cloudflare runtime.
- `GET https://booking.alps2alps.com/api/public/v1/transfer-options` returned
  HTTP **200** for Geneva Airport (`airport-1`) -> Chamonix (`resort-11`).
  Actual JSON contained currency EUR, expected route/pickup/adult fields,
  luggage fields and three `requested` vehicle offers. **No booking was
  created.**
- The temporary GitHub Actions connectivity workflow was removed before
  merging; no API credentials were ever included in the workflow.

Because the provider documents `Access-Control-Allow-Origin: *` for the
keyless public endpoint and a stateless GET quote-only flow, an **independent
private browser-side test** is now available on the existing authenticated
`/alps-preview` route: **Test public quote (no key)**. This does not try to
work around API access controls: it uses the official public endpoint expressly
documented for browser calling. It is user-initiated, supports only the fixed
Geneva -> Chamonix route, and uses the currently chosen local pickup date/time
and adults, with explicitly selected suitcase count and zero ski bags.
The GET request is non-booking and uses no API credentials, promo or affiliate
tracking fields. The returned quote and booking URLs are intentionally ignored;
the UI renders only validated route-correct prices, capacity, actual pickup
time and provider-echoed luggage.

**The Public API returns real public quotes, unlike the B2B sandbox.** The UI
labels them clearly as private test-only, not public site offers, and warns that
retail pricing, permission to compare offers and affiliate commission attribution
still need verification with Laura. Do not copy these prices into the four-provider
fictional demo or use them for a public comparison engine yet. The protected
preview still needs hosting-side Access/WAF and shared limiter before wider access.
Avoid repeated searches; the public API imposes its own rate limits.

If the public browser test works while hosted B2B POST /token fails, that is
consistent with an origin/Cloudflare egress-specific problem rather than a
global Alps2Alps outage. To isolate B2B network failure further, hosting
logs or provider network allowlisting may be needed. **Do not rotate API
secrets solely because a fetch failed.**

## Pending verification / questions for Laura

1. Is the public quotes endpoint suitable for a commercial comparison site,
   and are its prices identical to consumer checkout?
2. Is displaying Alps2Alps next to competitors authorized?
3. How is affiliate attribution for code `AIRPORTRIDEFINDER` preserved
   in a vehicle-specific quote URL and actual customer booking?
4. Do B2B transfer-request prices reflect customer-facing gross rates
   or partner/net rates? Are there production fees, rate limits, or quotas?
5. Are any caching, price validity or refresh requirements imposed?
6. Which API (keyless public quotes or authenticated B2B v2) is supported
   for a search-and-redirect rather than a booking-management workflow?

Do not send questions separately yet; collect further findings first.

## Automated verification

`src/test/alps2alps-sandbox.test.ts` uses an injected fake fetch only.
CI performs no real API requests, so green CI tests establish code integrity,
**not** successful authentication with the hosting-only Sandbox keys.
Real authentication and price/vehicle shape must be confirmed from the
password-protected hosted preview before claiming a live test has passed.
