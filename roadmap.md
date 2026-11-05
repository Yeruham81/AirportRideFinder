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
- [x] Diagnostic workflow disabled following its authorized run; secrets and raw API responses never logged
- [x] Opt-in server-side private-transfer adapter: strict price/capacity/category normalization, unknown fee inclusion, disabled booking, isolated from mock providers
- [x] Separate noindex /intui-preview read-only page and server function, OFF by default until deployment-only INTUI_API_KEY + INTUI_LIVE_ENABLED=true + INTUI_PREVIEW_ENABLED=true
- [ ] Enable preview only in an access-controlled environment with rate limits; verify deployment secret separately from GitHub Actions secret
- [ ] Public comparison and redirects — not started. Requires provider tracking/affiliate attribution and safe live-mode UX; no booking/payment integration.

## Later (needs approval)
- Phase 2B+ — not started
