# AirportRideFinder — Implementation Plan (Phase 0 → Phase 1)

## A. Product understanding
AirportRideFinder is an independent metasearch and affiliate referral site for airport transfers. Travelers search one route, compare offers from several independent providers side by side, then continue to the provider's own site to book and pay. We never take bookings, process payments or act as an operator. Credibility depends on fair comparison (same route, date, capacity, vehicle class) and honest data (no invented prices, ratings or terms).

## B. Mockup review
- Only the desktop mockup was attached. The mobile layout will follow the written mobile rules in the brief. Please share the mobile mockup if you want it matched more closely.
- Things we keep: a light header with logo and tagline, an airport photo behind a large headline, a search bar in one row, an "at a glance" strip with the four providers, a filter sidebar, horizontal offer cards, and a disclaimer bar.
- Corrections to the mockup, based on the brief:
  - The fixed date "14 Apr 2027" becomes a date picker that starts on a future date worked out each day, and past dates cannot be picked.
  - The nav items "How It Works / Popular Routes / About" are only shown if their pages exist. Phase 1 adds a small How It Works page and an About page. "Popular Routes" is left out.
  - "Lowest demo price" is renamed "Lowest sample price". No Best Value score is added.
  - The currency switcher shows "USD only (sample)". It does not pretend to convert prices.
  - Each card also shows whether taxes and fees are included, how fresh the quote is, and "Booking completed on provider's site".
  - The airport photo comes from a licensed source, or is one AI image made in a single pass. No paid image service is used.

## C. Recommended technical architecture
- The existing TanStack Start (React 19, Vite, Tailwind v4) setup, with pages rendered on the server for SEO. No new framework is needed.
- Phase 1 runs entirely in the app with mock data: no Lovable Cloud, no database, no secrets.
- Search runs through a single `searchTransfers(request)` service. In Phase 1 it calls mock adapters directly. In Phase 3 the same contract moves behind a server function (`createServerFn`), so API keys never reach the browser and the screens do not change.
- Search parameters live in the URL (`/search?from=LHR&to=central-london&date=...&time=...&pax=2&bags=2`), so searches can be shared, and a reload gives the same results.

```text
UI (routes/components)
   -> search orchestrator (parallel adapters, timeouts, partial results)
        -> provider adapters (mock now, live later)
   -> normalization + comparison (taxonomy, filters, sort)
   -> redirect layer (demo dialog now, /go/:offerId tracked redirect later)
```

## D. Application structure
```text
src/
  domain/          types.ts, vehicle-taxonomy.ts, cancellation.ts, money.ts
  data/            locations.ts, providers.ts, mock-offers/{lhr,jfk,cdg}.ts
  providers/       adapter.ts (interface), mock/ (one adapter per fictional provider), registry.ts
  search/          orchestrator.ts, normalize.ts, compare.ts (filter/sort), validation.ts (zod)
  redirect/        redirect.ts (demo mode now)
  components/
    layout/        SiteHeader, SiteFooter, DisclaimerBar
    search/        SearchForm, LocationSelect, DateTimeFields, PaxLuggageFields
    results/       SearchSummary, AtAGlanceStrip, OfferCard, OfferList, FilterPanel,
                   MobileFilterSheet, SortSelect, EmptyState, ProviderStatusNotice, ResultsSkeleton
    deal/          ViewDealDialog
  routes/          index.tsx, search.tsx, how-it-works.tsx, about.tsx
  test/            unit tests for compare, orchestrator, validation, timezone
```

## E. Core TypeScript models (summary)
- **NormalizedLocation**: id, displayName, type (airport | terminal | city | hotel | address), iata?, coords?, countryCode, locality, timeZone (IANA), providerRefs: Record<providerId, string>.
- **TransferSearchRequest**: pickupId, dropoffId, localDate, localTime, timeZone, passengers, luggage, currency (ISO 4217), vehicleCategories?, returnTrip? (reserved for later).
- **VehicleCategory**: an enum (economy_sedan, standard_sedan, comfort_sedan, business_sedan, minivan, minibus, executive) plus explicit mapping rules from each provider's own wording.
- **CancellationPolicy**: kind (free_until | with_fee | non_refundable | unknown), hoursBefore?, feeDescription?.
- **PriceMetadata**: amount (whole cents), currency, taxesAndFees (included | excluded | unknown), components?.
- **TransferProvider**: id, displayName, brandColor token, isFictional, websiteUrl?.
- **NormalizedTransferOffer**: id, providerId, providerOfferId, searchRef, category, providerVehicleLabel, maxPassengers, maxLuggage, price, cancellation, waitingTimeMins | null, meetAndGreet | null, conditions[], bookingRef, retrievedAt, expiresAt | null, source (mock | live), actionable, missingFields[].
- **ProviderSearchResult**: providerId, status (ok | empty | error | timeout), offers, error? (no sensitive detail), durationMs, partial.
- Missing data is stored as null and shown as "not available". It is never filled with a guess.

## F. Mock data strategy
- 4 fictional providers (SkyShuttle, AeroRide, TransferNest, BlueTerminal), each clearly marked as fictional.
- 3 routes: LHR → Central London (sedan prices $42/$47/$51/$58 with the brief's cancellation terms), JFK → Manhattan, CDG → Central Paris. Each route has its own prices and a mix of sedan, minivan and minibus offers, so changing passengers or bags changes the results.
- The data is deterministic: the same search always gives the same results. One provider has no offers on one route, to show partial results. A query flag (`?demoFail=aeroride`) simulates a provider failure.
- Unsupported routes show an empty state that lists the demo routes. Offers are never generated at random.

## G. Comparison logic
1. Drop offers that cannot take the requested passengers or luggage, and keep a count of how many were dropped.
2. By default, show only the vehicle class that matches the request (standard sedan for 1–3 passengers; the smallest suitable class otherwise). Users can change the class. When classes are mixed, results are grouped under class headings.
3. Filters: vehicle class and cancellation policy (Phase 1). Counts come from the actual results. "Reset filters" clears everything.
4. Sort: price low to high, or high to low. "Lowest sample price" is a plain fact label, applied only within the same class.

## H. UI component plan
Build on the existing shadcn base. Semantic colors (navy, blue, teal, green, gray) go in `styles.css`. Fonts: a distinctive but professional sans pair, for example Manrope for headings and DM Sans for body text. Mobile: the search form stacks vertically, filters open in a bottom sheet, and offer cards become compact, with price and button in a full-width row. Tap targets are at least 44px. View Deal opens a dialog that says it will send the visitor to the provider's site, and that no booking is made in this preview.

## I. Future API integration
- `ProviderAdapter { id; search(req, ctx): Promise<ProviderSearchResult>; mapLocation(loc) }`.
- In the server orchestrator, every adapter has its own time limit, and a failing provider does not stop the others.
- Later additions: a short-lived quote cache keyed by the normalized request, a rate limiter for each provider, and secrets kept only on the server.
- GetTransfer and Intui.travel are open decisions until their docs and partner access are confirmed. The adapter interface is designed so either can be added.

## J. Database recommendation
None in Phase 1. Later (Phase 3+), Lovable Cloud Postgres for providers, location mappings, cached quotes and redirect click logs, with strict access rules. It will only be added with your approval.

## K. SEO and rendering
- Home, How It Works and About are rendered on the server, each with a unique title, description and Open Graph tags.
- `/search` is set to noindex.
- Every page has a proper heading structure. The site gets a sitemap and a robots.txt.
- A planned URL scheme for later: `/airports/:iata`, `/transfers/:iata/:destination-slug`, `/guides/:slug`. These pages are not built in Phase 1.

## L. Security and privacy
- No secrets, no tracking and no personal data in Phase 1.
- All search input is checked with zod.
- Location ids come from a fixed allow-list.
- Later: server-only API keys, signed redirect tokens, privacy-safe logs.

## M. Testing and verification
- Unit tests (vitest) for filters and sorting, how capacity rules drop offers, partial and failed providers, date checks (no past dates) and time zone handling.
- A browser check of the main search flow on desktop and mobile.

## N. Scalability and portability
- Standard React and TypeScript with few extra libraries, and nothing tied to one vendor.
- Data, adapters and UI are kept separate, so providers, currencies and languages can be added later (all text kept in one place for future translation).
- The code is ready for GitHub sync.

## O. Phases
0. Planning (this plan).
1. Prototype (below).
2. UI polish and architecture review.
3. First live provider, through a server function, plus Cloud if approved.
4. Second provider, plus checks that comparisons stay fair.
5. Production hardening: caching, rate limits, monitoring, legal pages.
6. SEO content and launch.

## P. Risks and decisions for you
- Mobile mockup: please share it, or approve following the written mobile rules.
- Hero image: a licensed stock photo you provide, one AI image, or a plain illustration.
- Phase 1 will show USD only.
- Legal disclaimers and the affiliate disclosure text need your review before launch.

## Q. First Build task (Phase 1, after approval)
1. Add design tokens and fonts, then the header, footer and disclaimer bar.
2. Write the domain types, taxonomy, mock locations, providers and offers.
3. Build the mock adapters, orchestrator, and filter and sort logic, with tests.
4. Build the home page (search form, then results on `/search` with URL parameters).
5. Add the result components, empty, loading and error states, and the View Deal dialog.
6. Add the How It Works and About pages, SEO tags, and the responsive mobile layout.
7. Check the search flow end to end on desktop and mobile.

Not included: no APIs, Cloud, accounts, payments, analytics or publishing.
