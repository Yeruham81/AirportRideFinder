# AirportRideFinder — Implementation Plan (Phase 0 → Phase 1), Revision 3 (approved scope + final clarifications)

## A. Product understanding
AirportRideFinder is an independent metasearch and affiliate referral site for airport transfers. Travelers search one route, compare offers from several independent providers side by side, then continue to the provider's own site to book and pay. We never take bookings, process payments or act as an operator.

The core of the experience is a side-by-side price comparison between providers. Results put these first, in this order:
1. Provider identity
2. Comparable total price
3. Capacity
4. Cancellation terms
5. View Deal

The vehicle class gives context, but this is not a vehicle-picker.

## B. Mockup review
- The desktop mockup is the main visual reference. The mobile version follows the written rules in the brief.
- Things we keep: a light header with logo and tagline, an airport photo behind a large headline, a search bar in one row, an "at a glance" strip with the four providers, a filter sidebar, horizontal offer cards, and a disclaimer bar.
- Homepage: the full airport-photo hero with the prominent search form, as in the mockup.
- `/search`: a compact search header (one-row editable form, no large hero) so the comparison sits high on the page and stays the main focus. The search can be changed in place without returning home. On mobile the compact form collapses to a summary with an "Edit search" toggle.
- Corrections to the mockup, based on the brief:
  - The fixed date becomes a date picker that starts on a future date worked out each day. Past dates cannot be picked.
  - Navigation shows only "Compare Transfers", which goes to Home. "How It Works", "Popular Routes" and "About" are left out until those pages exist.
  - "Lowest demo price" is renamed "Lowest sample price". There is no "Best Value" score.
  - There is no currency selector in Phase 1. Each demo route has one predefined sample currency (LHR and JFK in USD, CDG in EUR). The header, summary, strip and cards all show that route's currency, e.g. "Prices in EUR (sample)". A mismatch is never possible.
  - Cards show whether taxes and fees are included, and say "Booking completed on provider's site".
- Hero image: one temporary visual (a licensed stock photo or a single AI image), kept light. The effort goes into the comparison features, not decoration.

## C. Recommended technical architecture
- The existing TanStack Start setup (React 19, Vite, Tailwind v4), with pages rendered on the server. No database, no backend services, no secrets and no outside calls in Phase 1.
- One search service handles every search: `searchTransfers(request)`. In Phase 1 it calls mock adapters inside the app. Later, the same contract can run on the server so provider keys stay off the browser. The screens do not change when that happens.
- Search settings are kept in the URL (`/search?from=LHR&to=central-london&date=YYYY-MM-DD&time=HH:mm&pax=2&bags=2`). These are not sensitive.
- Business logic (domain, search, comparison) is plain TypeScript with no framework or vendor imports. This keeps it portable to other hosting or backends.

```text
UI (routes/components)
   -> search orchestrator (parallel adapters, per-provider status, partial results)
        -> provider adapters (mock now, live later)
   -> normalization + comparison (taxonomy, eligibility, filters, sort) -> single view model
   -> redirect interface (demo dialog now; strategy decided per provider later)
```

## D. Application structure
```text
src/
  domain/      types.ts, money.ts, vehicle-taxonomy.ts, cancellation.ts, time.ts
  data/        locations.ts, providers.ts, mock-offers/{lhr,jfk,cdg}.ts
  providers/   adapter.ts (interface), mock/ (one adapter per fictional provider), registry.ts
  search/      orchestrator.ts, compare.ts (eligibility/filter/sort/group), view-model.ts, validation.ts
  redirect/    redirect.ts (provider-independent interface; demo implementation)
  components/
    layout/    SiteHeader, SiteFooter, DemoDisclaimer
    search/    SearchForm, LocationSelect, DateTimeFields, PaxLuggageFields
    results/   SearchSummary, AtAGlanceStrip, OfferCard, OfferList, CategoryGroup, FilterPanel,
               MobileFilterSheet, SortSelect, EmptyState, ProviderStatusNotice, ResultsSkeleton
    deal/      ViewDealDialog
  routes/      index.tsx, search.tsx
  test/        domain, search, view-model, UI-flow tests
```

## E. Core TypeScript models (summary)
- **Money**: a currency code (ISO 4217) plus a whole-number amount in that currency's smallest unit, using a stored table of decimal places (USD 2, JPY 0, KWD 3, and so on).
  - Formatting uses `Intl.NumberFormat` with the right decimal places. Sorting and comparing are done in whole numbers, so there are no rounding errors.
  - Prices are only compared when they are in the same currency.
  - The provider's original price is stored as `quotedPrice` and is never overwritten. A separate `displayPrice` field is reserved for later conversion, with its rate and source. In Phase 1 it is always null.
- **NormalizedLocation**: id, displayName, type (airport | terminal | city | hotel | address), iata?, coords?, countryCode, locality, timeZone (IANA), providerRefs: Record<providerId, string>. Each provider maps locations through its own ids.
- **TransferSearchRequest**: pickupId, dropoffId, localDate, localTime, timeZone (taken from the pickup location), passengers, luggage, preferredCurrency, vehicleCategories?, returnTrip? (reserved).
- **VehicleCategory**: a fixed list of classes. Each provider label maps to a class only through an explicit rule. Unmapped labels go to `unclassified` and are never treated as matching anything.
- **CancellationPolicy**: kind (free_until | with_fee | non_refundable | unknown), hoursBefore?, feeDescription?.
- **PriceMetadata**: quotedPrice (Money), taxesAndFees (included | excluded | unknown), components?.
- **TransferProvider**: id, displayName, brand token, isFictional.
- **NormalizedTransferOffer**: id, providerId, providerOfferId, searchRef, category, providerVehicleLabel, maxPassengers, maxLuggage, price, cancellation, waitingTimeMins | null, meetAndGreet | null, conditions[], bookingRef (an opaque link reference), source, and a `quote` field:
  - Mock offers use `{ kind: "sample" }`. They have no retrieved-at time, no expiry time and are not actionable.
  - Live quotes will use `{ kind: "live", retrievedAt, expiresAt | null, revalidation? }`.
  - The interface reads this field to decide which wording to show.
- **ProviderSearchResult**: providerId, status (ok | no_offers | error | timeout), offers[] (a provider can return several), error? (no sensitive details). `no_offers` is a successful reply and does not count as a failure. Only `error` and `timeout` make the overall search "partial".
- Missing data is stored as null and shown as "not available". It is never filled with a guess.

## F. Mock data strategy (demonstration only)
- **Providers:** 4 fictional providers (SkyShuttle, AeroRide, TransferNest, BlueTerminal), each labelled "Fictional provider".
- **Routes:** 3 routes, each with its own fixed sample offers:
  - LHR → Central London: sedans at $42, $47, $51 and $58, with the cancellation terms from the brief, plus some minivan offers.
  - JFK → Manhattan.
  - CDG → Central Paris: priced in EUR, to exercise multi-currency handling. EUR prices are never ranked against USD prices.
- **Wording:** sample offers do not depend on the date or time. They say "Sample price for this route — not checked for your selected date and time". There are no "quoted at" or "valid until" times on mock data.
- **Same results every time:** the same search always shows the same offers.
  - Changing passengers or luggage changes which offers are eligible.
  - One provider has no offers on one route, to show the "partial" case.
  - A URL setting, `?demoFail=<providerId>`, simulates a provider failure.
- **Unsupported routes:** these show an empty state that lists the demo routes. Offers are never generated at random.
- **Disclaimer:** shown under the results and next to the prices: "Sample prices and provider information are for demonstration purposes only. No live bookings are available in this preview."

## G. Comparison logic
1. **Eligibility:** offers that cannot fit the requested passengers or luggage are dropped. The page says how many were dropped ("2 offers hidden: insufficient capacity").
2. **Default view:** the first view shows the class that matches the request. For 1 to 3 passengers this is Standard Sedan, and for larger groups the smallest suitable class. Offers in other suitable classes are never hidden. They appear under "Other suitable vehicle types (N)", grouped by class, and can be shown with one click or from the vehicle class filter.
3. **Filters:**
   - Vehicle class (multi-select, including "All suitable") and cancellation policy.
   - Filter counts come from the same set of results that is displayed.
   - "Reset filters" clears all of them.
4. **Sort:** price, low to high or high to low, within each currency. The "Lowest sample price" label only compares offers in the same class and currency.
5. **One source of truth:** a single view model feeds the at-a-glance strip, the offer cards, the counts and the summary, so prices and filter states cannot disagree.
   - The strip shows the cheapest matching offer per provider in the currently shown class.
   - A provider that replied with no matching offer appears as "No comparable offer for this route". This is neutral wording, not a warning.
6. **Provider status messaging:**
   - When a provider fails or times out, a warning reads "Results may be incomplete: AeroRide did not respond". That provider's card shows "Unavailable".
   - When everyone replies but some have no offers, there is no warning, only the neutral note.
   - The search is never described as covering all providers when one has failed.

## H. UI component plan
- **Building blocks:** the existing shadcn components and semantic color tokens (navy, blue, teal, green, gray).
- **Fonts:** a professional sans pair, for example Manrope for headings and DM Sans for body text.
- **Desktop:** horizontal cards as in the mockup.
- **Mobile:**
  - The search form stacks into one column.
  - Sort and filters sit in a sticky bar, and filters open in a bottom sheet.
  - Cards are compact, with provider and price first and a full-width View Deal button.
  - There is no sideways scrolling, and tap targets are at least 44px.
- **View Deal:** opens a demonstration dialog. It explains that a live version would send the visitor to the provider's site, and that no booking is made here.

## I. Future integration readiness (architecture only, not built in Phase 1)
- **Adapter contract:** each provider adapter implements `ProviderAdapter { id; search(req, ctx); mapLocation(loc) }`. This handles provider-specific responses, location ids and multiple offers per provider.
- **Redirects:** a provider-independent `resolveBookingLink(offer, ctx)` turns the offer's opaque `bookingRef` into a destination when the visitor clicks. It allows for temporary URLs, quote ids, signed links and affiliate parameters, each with its own validity rules. The final URL or redirect-route strategy is an open decision, to be made after reviewing each provider's API and affiliate terms.
- **Server side, later:** provider credentials stay on the server only. Each provider gets its own time limit, rate limit and caching rules. Quotes are revalidated before redirecting.
- **Time zones:** pickup times are stored as local time plus an IANA time zone, which is safe across daylight-saving changes.

## J. Database and hosting
- None in Phase 1, and no backend is set up.
- Later, PostgreSQL is a likely choice for providers, location mappings, quote caching and click logs. The database and hosting provider will be chosen once real production needs are known.
- Business logic stays independent of any particular infrastructure.

## K. SEO and rendering
- **Home:** rendered on the server, with a unique title, description and Open Graph tags.
- **`/search`:** also rendered on the server, but marked noindex.
- **Structure and files:** proper headings, plus robots.txt and a basic sitemap (Home only).
- **Future URLs:** the scheme is planned now but not built: `/airports/:iata`, `/transfers/:iata/:destination`, `/guides/:slug`.

## L. Security and privacy
- No secrets, tracking or personal data in Phase 1.
- All URL and form input is checked (zod).
- Locations come from a fixed allow-list.
- No outside requests at all.

## M. Testing and acceptance (vitest + Playwright check)
Automated tests will check that:
- The four fictional providers come back as distinct providers, each with its own id and name.
- Price sorting is correct in both directions, works with exact whole-number amounts, and never mixes currencies.
- The class and cancellation filters work, and the counts match what is shown.
- Offers that do not fit the passengers or luggage are excluded, and the excluded count is right.
- The empty route, filters that remove everything, a provider with no offers, and a simulated provider failure each show the right message.
- A provider with `no_offers` is never shown as a failure or as partial results. A provider with `error` or `timeout` always is.
- The displayed currency always matches the route's sample offers (CDG shows EUR everywhere).
- The strip, cards, summary and "Lowest sample price" label show the same prices and terms, because they come from one view model.
- Every mock offer is marked "sample", has no timestamps, and is shown with sample wording. The words "live", "available" and "valid until" never appear for mock data.
- Money formatting handles 0, 2 and 3 decimal places correctly.
- Past dates are rejected, and the default date is in the future.
- No network calls are made during a search: the test fails on any outside request.

Playwright check: the search flow at desktop size (1280px) and mobile size (390px). It covers search, filters, sort and the View Deal dialog.

Confirmation by checking the code: no databases, payments or outside APIs are wired in.

## N. Scalability and portability
- Few extra libraries and no proprietary dependencies in the logic layers.
- All text is kept in one place, ready for future translation.
- The project is compatible with GitHub for later manual development.

## O. Phases
- **Phase 0:** planning (this plan).
- **Phase 1:** the prototype described below.
- **Phase 2:** UI polish and an architecture review.
- **Phase 3:** the first live provider, running on the server. The hosting and database choice is made at this point.
- **Phase 4:** a second provider, plus checks that comparisons stay fair.
- **Phase 5:** hardening (caching, rate limits, monitoring, legal pages).
- **Phase 6:** SEO content and launch.

## P. Open decisions
- The redirect and affiliate link strategy, decided per provider once their docs are available.
- The future database and hosting.
- Final hero photography.
- Legal and affiliate disclosure wording, before launch.

## Q. First Build task (Phase 1, after approval)
1. Design tokens, fonts, header and footer.
2. Domain types, the money helpers, the vehicle classes, and the mock locations, providers and offers.
3. Mock adapters, the search service, the comparison rules and the single view model, with unit tests.
4. The home page and the `/search` page, with search settings in the URL.
5. Results: the at-a-glance strip, cards, category groups, filters and sort, the empty, partial, loading and error states, and the View Deal dialog.
6. The mobile layout, page metadata, robots.txt and sitemap.
7. The Playwright check on desktop and mobile.

8. A short implementation report covering: what was built, what was tested, failed or incomplete tests, deviations from the plan, the main files and modules, and open issues before Phase 2.

Not included: About and How It Works pages, outside APIs, a database or backend, accounts, payments, analytics and publishing. Phase 2 does not start without your approval.
