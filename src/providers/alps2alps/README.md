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
