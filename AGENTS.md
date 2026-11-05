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
- GetTransfer sandbox code lives in `providers/gettransfer/` (pure parser + `*.server.ts` client) and is invoked only by `scripts/gettransfer-sandbox-check.ts`; it is not registered in the adapter registry or any route — sandbox diagnostics must never reach public pages or expose the token.
- Intui is NOT in the default mock registry. The separate `/intui-preview` route is read-only and `noindex`; its server function requires `INTUI_PREVIEW_ENABLED=true`, `INTUI_LIVE_ENABLED=true`, and a server-only `INTUI_API_KEY`. Do not activate a public preview without suitable access controls and rate limits. No affiliate redirects, bookings or payments are enabled; never mix demo and live offers.
