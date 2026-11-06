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


## Dynamic location and quote tests (6 Nov 2026)

The authenticated, noindex `/alps-preview` now includes a full **Public API
quote tester above the separate B2B Sandbox test**:
- Enter at least two characters and click **Find locations** for either
  endpoint. Each click uses the official unauthenticated,
  rate-limited `GET /api/public/v1/locations/search?q=...` endpoint.
  Select only a provider-returned result. Country and location type are
  displayed because some names match more than one location code.
  Both endpoints can be swapped; invalid or same-place combinations cannot
  be quoted.
- Choose Alpine-local pickup date/time, 1–16 adults, 0–8 suitcases,
  0–8 ski/snowboard bags, and EUR / GBP / USD. The public quote request
  remains an explicit click and a `GET /transfer-options` call only;
  `is_flight=0` treats the entered time as literal local pickup, not
  flight arrival. Baggage is sent explicitly, bypassing seasonal defaults.
- Validate the exact vendor-echoed location codes, currency, passenger count,
  pickup time, suitcases and ski bags. Unsupported routes show
  `route_unavailable`; no made-up quote is ever displayed. For currencies
  other than EUR, values can change because of exchange-rate updates.
- Results remain **only in React state**, are cleared when search fields
  change, and use the provider's validated price and capacity attributes.
  The parser checks only whether returned vendor URLs have a known,
  first-party structure and match the queried route/date/selected vehicle.
  It returns the existence/number of matching links but **does not
  expose, store, follow, click, or construct** any booking URLs.
- No key, secret, affiliate `pc`/`promo`, backend order, or checkout action
  is used. External rate limits apply; search is manual, never automatic
  typeahead polling. The commercial permission and commission attribution
  questions for Laura remain open; **do not send until testing is complete**.

Public API technical reference:
https://www.alps2alps.com/developers/public-api/

The existing fixed-route **B2B Sandbox** controls remain separate and may
continue to show `network_error` at `POST /token` in Lovable hosting.

## Route-directory autocomplete and explained quote mismatches

The private public-API test no longer requires **Find locations**. Once the
authenticated preview mounts, it makes one **keyless GET** to the supplier's
official active-route resource:
`https://booking.alps2alps.com/api/resource/routes` (also linked by Laura).
An independent no-credentials request on 6 Nov 2026 confirmed HTTP 200,
CORS `*`, 4,351 route records and 4,316 active route rows (approximately
815 KB). The one-time response supplies canonical `station`, `resort`,
names and `is_active`. Only active, shape-valid rows are accepted. The
picker filters those provider-supplied endpoints locally **from the first
character**, supports accent-insensitive matching, keyboard ArrowDown/Up,
Enter, Escape, or mouse selection; there are no per-keystroke quote calls.
The destination suggestions are constrained to active supplier pairings from
the chosen origin; choosing a different origin clears an incompatible
previous destination. The vendor still checks availability at quote time.
Only in case the master route catalog is unavailable, the picker falls back
to the official public `GET /locations/search?q=...` endpoint, debounced
after at least two typed characters as required by its documentation.
The two pre-existing Geneva Airport and Chamonix sample locations are the
only preloaded fallback suggestions and are actual verified supplier codes.

A temporary, credential-free workflow verified that the live public GET
`/transfer-options` echoed the selected November route/date/time, passenger
count and luggage for Geneva Airport → Chamonix. For a **July** departure,
the supplier returned `ski_bags=0` after receiving a request for two ski
bags: its documented summer policy ignores ski bags. Previously the strict
parser reported a generic `malformed_response`. The updated parser reports a non-sensitive `quote_mismatch` reason
identifying which of route, currency, adult count, pickup time, suitcases
or ski bags differed. If the **only** mismatch is that the supplier quoted
**zero ski bags** rather than the requested positive quantity, the same
supplier-confirmed prices are immediately displayed for **zero ski bags**
without an additional API request. The search field is reset to 0 and a
conspicuous warning states how many ski bags were originally requested,
that they are **not included in the displayed price**, and that the
traveler must clarify acceptance and any charges with Alps2Alps.
This does not imply that ski baggage is free, accepted, or included.
Other ski-bag mismatches (for example requesting 3 and receiving 1),
or mismatches in route, currency, passengers, pickup, or suitcases remain
rejected and cannot be silently normalized. A truly malformed upstream
JSON shape still returns `malformed_response`; we never invent a quote.

The route catalog request is automatic **only after authentication**;
the real price GET remains manual. Neither catalog nor search uses provider
API credentials, `AIRPORTRIDEFINDER` tracking code, booking endpoints or
deep links. There is no public customer-facing comparison or booking flow.
Supplier rate limits and separate host Access/WAF protections must still be
respected for any wider use. The exploratory GitHub probe was deleted
before merging.

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
