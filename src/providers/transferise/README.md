# Transferise private sandbox preview

`/transferise-preview` is separate from the public comparison, disabled by default,
and uses the existing private preview password/session signing secret. All API
requests originate on the server after authentication. Location suggestions are
debounced while typing; quotes are requested only on explicit submission.

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

1. Open `/transferise-preview`, unlock it, type `Antalya` into Pickup and choose
   the airport from the actual provider suggestions. Type `Rixos` in Destination
   and choose the intended hotel. The old three-preset dropdown is no longer used.
2. Suggestions are fetched automatically after 2 characters and 350 ms without
   typing. Only real API records are shown; a small 5-minute local cache may also
   suggest previously returned places from the first character. Keyboard arrows
   and Enter or a mouse click select an item. Editing the text immediately clears
   its selected ID and any previous quote. Late responses cannot replace current
   suggestions. Typing has its own per-minute limit, separate from quote searches.
   An empty short-prefix reply is merged with matching unexpired provider records
   already fetched (for example, shortening `RIX` to `RI` preserves known Rixos
   records). Initial two-character empty replies ask the user to keep typing;
   the UI does not claim the provider universally requires three characters.
3. Check the pickup time zone (inferred for known airports/countries, otherwise
   select it explicitly), pickup date/time, passengers and currency. Submit a
   quote. The server re-queries each selected place's original search and requires
   its exact ID to still be returned before calling `quote`. Browser text/labels
   and manually supplied IDs cannot bypass provider-database verification.
   Test other covered pairs and the reverse direction where supported. A place
   being found does not guarantee the provider prices every pair of places.
4. If the response explicitly has `test: true` and returns a valid HTTPS
   `transferise.com` URL, manually open **Open sandbox booking page**. The URL and
   referral parameters are preserved. It is a route link, not a promise that a
   particular vehicle is preselected. Check the developer console for attribution
   and the sandbox checklist; this preview cannot verify that console remotely.
5. If `test` is absent or false, no checkout link is shown, even if prices are
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




