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

## Alps2Alps — Public API referral integration (23 November 2026)
- [x] Laura confirmed Public API suitability, AIRPORTRIDEFINDER attribution, 5% customer discount, 10% completed-transfer commission, reporting and payout terms.
- [x] Send `pc=AIRPORTRIDEFINDER`; preserve supplier prices and validate/use returned links unchanged through the redirect resolver.
- [x] Keep authenticated, noindex `/alps-preview` and existing route-directory autocomplete; isolate live quotes from the fictional comparison registry.
- [x] Resolve seasonal baggage mode from API defaults instead of calendar cutoffs; combine suitcases and ski bags into the winter count, including explicit zero-bag searches.
- [x] Add children, infants, child seats and boosters with full request/response reconciliation; keep both bag selectors visible.
- [x] Use supplier-filtered vehicles; reject incomplete baggage quotes and preserve summer ski requirements.
- [x] No-store prices, 60-second local quote expiry, 20 raw quote requests/minute browser pacing and HTTP 429 cooldown; no automatic price polling or retries.
- [x] Mocked contract/UI tests for partner links, unchanged discount prices, configurable seasons, whole-group counts, expiry and invalidated searches.
- [ ] Verify the deployed private preview in a browser and compare exact trip details against the supplier landing page.
- [ ] Confirm actual completed-booking attribution in the partner dashboard when a real customer booking is available.
- [ ] Roll out a public real-data comparison flow separately, with appropriate shared-IP rate controls and provider-specific production readiness.
- [ ] Add return journeys and cancellation-policy data when required.
- Existing B2B sandbox diagnostic is retained separately; its legacy hosted token-connectivity issue is not required for Public API referrals.

## Later (needs approval)
- Phase 2B+ — not started
