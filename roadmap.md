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
- [ ] Pure validated GEO inputs, conservative parser, disabled server-only adapter, mocked tests
- [ ] Live requests and UI wiring — blocked: verified auth/request and price/currency contract, secure INTUI_API_KEY and explicit activation required; affiliate tracking unconfirmed

## Later (needs approval)
- Phase 2B+ — not started
