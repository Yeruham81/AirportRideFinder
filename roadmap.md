# Roadmap

## Phase 1 — Functional comparison prototype (done, awaiting review)
- [x] Design tokens, fonts, header/footer
- [x] Domain models, money, taxonomy, time helpers
- [x] Mock locations/providers/offers + mock adapters + orchestrator
- [x] Comparison rules + single view model
- [x] Home page (full hero) and /search (compact header)
- [x] Results UI: glance strip, cards, groups, filters, sort, states, View Deal dialog
- [x] Noindex on all pages + robots.txt disallow
- [x] Provider status: no_offers is not a failure; only error/timeout → partial warning
- [x] Route-specific sample currency shown consistently
- [x] Unit tests + desktop/mobile browser check
- [x] Implementation report

## Phase 2A — GetTransfer sandbox read-only diagnostics
- [x] Server-only route_info client, parser, mocked tests, manual script
- [x] One authorized sandbox GET succeeded 16-Oct-2026: HTTP 200, success true; USD formatting subsequently tested offline

## Intui — isolated read-only development
- [x] Pure GEO request builder and fail-closed response parser; isolated disabled adapter
- [x] Gated server-only POST client and mocked transport tests (feature branch, pending CI review)
- [x] One-request shape diagnostic: HTTP 200; 102 candidate entries in `response.<dynamic-key>.travelling`; numeric `pricing.allprice.USD` confirmed (05-Nov-2026)
- [x] Parser understands nested response, numeric-string capacities and cancellation; synthetic tests added, live provider still disabled
- [x] Temporary diagnostic workflows disabled/removed following authorized runs; secrets and raw API responses were not logged
- [x] Opt-in server-side private-transfer adapter: verified support for opaque string product IDs, strict price/capacity/category normalization, unknown fee inclusion, disabled booking
- [x] Controlled integration smoke test 05-Nov-2026: 95/102 Intui entries normalized for LHR → central London, lowest observed quote USD 111.35, non-actionable, fees not guaranteed
- [x] Separate noindex /intui-preview read-only page and server function, OFF by default until deployment-only INTUI_API_KEY + INTUI_LIVE_ENABLED=true + INTUI_PREVIEW_ENABLED=true
- [x] Preview login: strong server-side access password, 30-minute HMAC-signed HttpOnly cookie, authenticated handler, and best-effort in-process request throttles
- [ ] Configure a secured hosting environment with perimeter access control, shared/distributed rate limit and all five server secrets; never assume GitHub Actions secrets are hosting secrets
- [ ] Perform protected end-to-end browser preview with the real Intui data, before enabling public comparison
- [ ] Public comparison and redirects — not started. Requires provider tracking/affiliate attribution and safe live-mode UX; no booking/payment integration.

## Alps2Alps / Amitours — initial B2B v2 sandbox evaluation
- [x] Server-only, allowlisted sandbox token, vehicle catalog and private-transfer quote client
- [x] Separate noindex /alps-preview behind an existing strong preview password, independent signed cookie and bounded quotas
- [x] User-triggered Geneva → Chamonix sandbox-only price preview with explicit non-booking disclaimer
- [x] Mock-only unit tests for price normalization, fail-closed API transport and zero unintended bookings
- [x] Hosting preview enabled; first real B2B sandbox authentication request fails with `network_error` at POST /token. Independent GitHub runner HTTP confirms endpoint responds (400 for dummy credentials).
- [x] Add separate credential-free, browser-side GET public quote diagnostic in protected /alps-preview; independently validated HTTP 200 and correct JSON fields for Geneva → Chamonix.
- [x] Confirm Public API from hosted browser: six live public prices, EUR 200–418.50, pickup 13-Nov-2026 at 14:00 local, 2 suitcases and 0 ski bags, no booking created.
- [x] Add manual vendor location search, dynamic one-way routes, swap direction, EUR/GBP/USD, passenger and suitcase/ski-bag inputs; strictly confirm provider echoed values.
- [x] Validate provider booking-link structure as non-actionable metadata only; no deep-link navigation or commission claims.
- [x] Replace manual location search button with first-character autocomplete backed by the supplier's verified active-route directory (4,316 active rows; 6 Nov 2026), with keyboard/mouse selection and active-pair filtering.
- [x] Diagnose reported generic `malformed_response`: distinguish mismatched quote fields and explain supplier's summer policy of ignoring ski bags instead of presenting a different quote.
- [x] Automatically show the already-returned provider zero-ski-bag prices if original search requested more: adjust input to 0 and display an explicit exclusion warning, no extra API call, no fake luggage inclusion.
- [x] Confirm first-character autocomplete in hosted browser (user verified), and zero-ski-bag fallback: 6 genuine offers displayed with explicit exclusion notice.
- [x] Simplify the exclusion notice while keeping the requested count, quoted 0, and carriage/fees warning.
- [ ] Test several dynamic routes and nonzero ski bags from hosted private page; verify no out-of-date/changed quote is displayed.
- [ ] Compare two real public API quotes against provider checkout (exact route, time, vehicle, passengers, luggage, EUR total); do not complete payment.
- [ ] Validate supplier-provided vehicle URLs in controlled preview without enabling affiliate redirects; confirm customer-facing quote details and return behavior.
- [x] Verify winter ski-bag handling: no-secret public GET returned 3 confirmed ski bags for 3 passengers on Geneva→Chamonix (22 Jan 2027) and Geneva→Avoriaz (11 Feb 2027); these responses unexpectedly confirmed 0 ordinary suitcases although 3 were requested.
- [ ] Clarify with Laura how Alps2Alps supports simultaneous ordinary suitcases and ski bags in winter, given API responses above; summer ski counts are ignored. Retain ski-bag input because winter routes support it.
- [ ] Confirm affiliate attribution for AIRPORTRIDEFINDER in API-generated checkout links, and permission for side-by-side competitor comparison, with Laura (one consolidated email after tests).
- [ ] Establish production quote rate limits, freshness/cache policy and safe 429 retry behavior; avoid assuming unlimited browser-side GETs.
- [ ] Consider return trips, children/child seats and cancellation terms after core one-way referral flow is approved.
- [ ] Resolve B2B sandbox auth egress / access problem if B2B remains necessary.
- [ ] Decide Public Booking API vs B2B v2 with Laura and confirm competitor display, affiliate attribution, fees and rate limits
- [ ] Production access and tracked redirects — not started

## Later (needs approval)
- Phase 2B+ — not started
