# Alps2Alps Public API referral integration

The protected, noindex `/alps-preview` route quotes real one-way transfers and
shows supplier-issued affiliate booking links. It remains separate from the
fictional `/search` comparison and is not registered in the mock provider registry.
The authenticated B2B sandbox below it remains a separate legacy diagnostic.

## Confirmed supplier contract — Laura, 23 November 2026

- The keyless Public API is sufficient for comparison and referral. The
  authenticated B2B API is for creating/managing bookings and is unnecessary here.
- Send `pc=AIRPORTRIDEFINDER` to `GET /api/public/v1/transfer-options`.
  Returned prices already include any applied customer discount (5% for private
  transfers). Never subtract it again or add markup.
- Use `quote_url` and vehicle `booking_url` exactly as returned. The supplier
  includes the partner code. Validate the host, route, trip, vehicle and code;
  never reconstruct a missing link or append tracking to the returned string.
- Commission is 10% of the completed transfer price including VAT. Attribution
  follows the customer visit; there is no later cookie window. Replacing the code,
  cancellations and refunds can remove attribution/commission. Reporting uses the
  transfer month. EUR bank payouts have a EUR 100 threshold and are requested by
  email; monthly or end-of-season payment is available.
- Include adults, children and infants. Child-seat and booster counts are sent
  separately and reconciled against the response; these seats are free.
- Prices are recalculated when the customer follows the booking link. PayPal
  charges, live currency rates, trip changes and an old quote can change the total.
- The supplier permits 20 price requests per minute per IP.

Technical reference: https://www.alps2alps.com/developers/public-api/
Laura's direct clarification takes precedence where the public guide is less
specific, especially for combined winter baggage and the `pc` parameter.

## Baggage and pricing flow

Season dates are configurable at the supplier. Never hard-code December/May.
Each manually submitted search makes at most **two** quote-only GET requests:

1. Omit `luggage`, `ski_bags` and `ski` to retrieve seasonal defaults. Validate
   route, time, currency and every passenger/seat count. Discard these prices.
   Read `outbound.luggage`: positive ski defaults with zero suitcases identify
   winter; positive suitcase defaults with zero ski bags identify summer.
   Ambiguous defaults stop the search rather than guessing.
2. Request the complete explicit baggage basket:
   - Winter: `ski_bags = suitcases + ski/snowboard bags`, `luggage=0`,
     `ski=1` when the combined total is positive. Zero bags stays explicitly zero.
   - Summer: `luggage = suitcases`, `ski_bags=0`, `ski=0`. A request containing
     ski equipment needs supplier confirmation; do not drop the user's bags or
     display a suitcase-only quote as covering them.

Validate the final echoed counts exactly. A dropped or partially reduced count
is an error. Both bag selectors remain visible, and winter results explain that
the supplier groups the bags into one count. Returned vehicles are already
filtered by the supplier; `max_luggage` is suitcase metadata and must not be used
to re-filter the winter combined count.

## Freshness, links and request limits

- Quote requests use `cache: no-store`; no price cache or background polling.
- Results clear when any search field changes. In-flight old results cannot
  replace a changed search. Links expire locally after **60 seconds** and require
  another manual search. This is our refresh policy, not a supplier price lock.
- Booking links pass through `redirect/resolveBookingLink`, including another
  age/host/partner-code check. Only a manual click opens the supplier website.
  No booking, payment or checkout API calls are made.
- The 5% label appears only when the response confirms an applied partner promo
  and percentage; the returned price remains unchanged if the promo is unavailable.
- A browser-local rolling limiter counts both discovery and final price requests,
  allowing at most 20 raw requests/minute (normally 10 full searches). HTTP 429
  starts a 60-second cooldown; there is no automatic retry. This supplements,
  rather than replaces, the supplier's per-IP limit shared by tabs/devices behind
  the same address. A future server proxy needs shared/distributed pacing.

## Access and existing B2B diagnostic

The current hosting gate still uses:

- `ALPS2ALPS_SANDBOX_PREVIEW_ENABLED=true`
- `INTUI_PREVIEW_ACCESS_PASSWORD`
- `INTUI_PREVIEW_SESSION_SECRET`

The Public API requires **no provider secrets**. Existing B2B sandbox calls also
require `ALPS2ALPS_SANDBOX_API_KEY` and `ALPS2ALPS_SANDBOX_API_SECRET` server-side.
Those credentials never go to the browser. B2B calls remain allowlisted to
`https://sandbox.amitours.com/api/v2`, with no production fallback. Legacy
`POST /transfer` creates a sandbox request record, not a booking, and remains
explicitly user-triggered. Its historical hosted `POST /token` network issue
does not block the Public API flow.

Keep the existing private login, secure HttpOnly session and noindex settings.
Wider public access still needs appropriate hosting access/rate controls and a
separate real-data comparison rollout. Do not mix these prices with fictional
provider offers.

## Verification

Tests use mocked APIs: combined and zero winter bags, a changed supplier season,
summer skis, all passenger/seat counts, unchanged prices/URLs, rejected links,
quote expiry, race handling and HTTP 429 cooldown. CI runs the full unit suite,
production build and TypeScript check. Passing these checks does not establish
payment, partner-dashboard attribution or a completed transfer commission.
