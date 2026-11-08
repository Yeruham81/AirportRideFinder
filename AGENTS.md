<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture rules

- Layers: `domain/` (types, money, taxonomy, time) → `providers/` (adapters) → `search/` (orchestrator, compare, view-model) → `components/` + `routes/`. Logic layers import no React or vendor SDKs — keeps business logic portable.
- Every provider integration implements `ProviderAdapter`; mock adapters and sample data (`data/mock-offers`) stay separate from future live adapters — swapping data sources must not touch UI.
- Money is integer minor units + ISO code via `domain/money.ts`; never float math or cross-currency ranking — avoids rounding errors and unfair comparisons.
- Provider status `no_offers` is a successful reply; only `error`/`timeout` mark results partial — keeps failure messaging honest.
- All results UI reads from one `buildViewModel` output — strip, cards, counts and labels can't disagree.
- Sample offers carry `quote: {kind:"sample"}` with no timestamps; never fabricate quote times — demo data must not look like live quotes.
- Booking links go through `redirect/resolveBookingLink`; final redirect strategy is undecided per provider.
- Search inputs live in the URL (`/search`), validated in `search/validation.ts`; pickup time is local time + IANA zone of the pickup location.
- While the site uses fictional data, every route stays `noindex` and robots.txt disallows all — prototype must not be indexed.
- GetTransfer sandbox code lives in `providers/gettransfer/` (pure parser + `*.server.ts` client). The read-only `/gettransfer-preview` route is separate, disabled by default, and requires an HMAC-signed private session, an environment flag, and rate limits before a manually triggered sandbox quote request; it is never registered in the public adapter registry. The sandbox token stays server-side. Never call production or booking endpoints, or display sandbox numbers as real production/bookable prices.
- Intui is NOT in the default mock registry. The separate `/intui-preview` route is read-only and `noindex`; its server function requires `INTUI_PREVIEW_ENABLED=true`, `INTUI_LIVE_ENABLED=true`, and a server-only `INTUI_API_KEY`. Do not activate a public preview without suitable access controls and rate limits. No affiliate redirects, bookings or payments are enabled; never mix demo and live offers.
- Transferise is NOT in the public adapter registry. `/transferise-preview` is a disabled-by-default, authenticated private sandbox with server-only `TRANSFERISE_SANDBOX_API_KEY` (`tfx_test_` keys only). Only `places` and `quote` GETs are implemented. Prices/currency must stay as returned, without markup. A returned `booking_url` may be opened manually only when the response explicitly marks it `test: true` and the HTTPS host is `transferise.com`. Never automate booking/payment operations, use a live key, expose credentials or request go-live as part of preview development.

