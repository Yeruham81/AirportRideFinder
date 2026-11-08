# Transferise private sandbox preview

`/transferise-preview` is separate from the public comparison, disabled by default,
and uses the existing private preview password/session signing secret. All API
requests originate on the server after authentication and a manual search.

Set these **on the hosting server**, never as `VITE_*` or in source control:

```text
TRANSFERISE_SANDBOX_PREVIEW_ENABLED=true
TRANSFERISE_SANDBOX_API_KEY=<your tfx_test_ sandbox key>
INTUI_PREVIEW_ACCESS_PASSWORD=<existing private preview password>
INTUI_PREVIEW_SESSION_SECRET=<existing signing secret>
```

Use the existing deployment-level access control and WAF/shared limiter covering
the preview and Start server functions. In-process rate limiting is supplementary
and shared with the other previews. No key is returned to the browser.

## Manual verification

1. Open `/transferise-preview`, unlock it, select Antalya Airport → Rixos Downtown
   Antalya with a pickup at least one week ahead, two passengers and EUR.
2. Submit once. The server resolves real location IDs with `action=places`,
   then calls `action=quote`. Check vehicle names, price/currency and capacity.
   Additional available test routes are Antalya → Kemer and Istanbul → Taksim;
   a route may be unavailable if the API cannot resolve an unambiguous match.
   For Rixos only, if the name lookup cannot resolve a place, the preview can
   try `hotel:17370`, explicitly supplied by Transferise's partner-console
   example. It shows that quote only if its `to` field exactly verifies a known
   Rixos Downtown property name. The airport is still resolved by IATA, and no
   arbitrary ID is guessed. If verification fails, prices and the booking URL
   are withheld. The private v3 diagnostic reports the lookup stage, counts and
   up to six sanitized place records, never keys, headers or raw responses.
3. If the response explicitly has `test: true` and returns a valid HTTPS
   `transferise.com` URL, manually open **Open sandbox booking page**. The URL and
   referral parameters are preserved. It is a route link, not a promise that a
   particular vehicle is preselected. Check the developer console for attribution
   and the sandbox checklist; this preview cannot verify that console remotely.
4. If `test` is absent or false, no checkout link is shown, even if prices are
   returned. Ask Transferise to confirm the sandbox response contract before
   opening any unverified checkout. No live checkout is inferred from URL shape.

This code creates **no bookings**, sends no traveller details and performs no
payments. No go-live request is automated. A live `tfx_` key is rejected before
any network call. Production approval/commission remains a separate step.

## Price integrity

Only positive, parseable `per_vehicle` prices in the requested currency, with
enough passenger capacity, are displayed. Per-person offers are omitted so they
cannot be mistaken for the total fare. All money is integer minor units, with no
conversion or markup. No results or booking link are fabricated.

References reviewed on 2026-11-08:
- https://transferise.com/developers/docs
- https://transferise.com/developers

Automated tests mock every response; a real quote requires the user's server-side
sandbox key and a deployment environment with outbound HTTPS access.

