# Isolated Intui development

Not imported by any route, registry, or public endpoint. No network transport,
secret reads, bookings, payments, tracked links, or UI wiring are enabled.

Source: https://support.travelpayouts.com/hc/en-us/articles/360016804119-intui-travel-API
(official help-center JSON version inspected during development).

Verified GEO fields: coordinatesType, gpsLatR/gpsLngR, gpsLatEnd/gpsLngEnd,
adults, arrivalDateTime (local ISO without offset, five-minute increments),
currency, lang, multiprice. GEO is one-way; bookingType is ignored and omitted.
The article labels the method GET but demonstrates POST with JSON and apikey.
No authentication header is inferred.

Verified response paths: status, LocationInfo.travelling, info.maxpax/luggage,
info.vehicle_type/type_vehicle/vehicle_class/free_cancellation,
additional.meet_greet. Strict numeric private-transfer capacities only.
Zero cancellation hours means no free cancellation; it does not prove a
non-refundable policy. Fees, waiting time, and quote expiry remain unknown.

The exact pricing.allprice JSON structure and currency representation have not
been independently validated. All nonempty replies currently fail closed;
diagnostics contain only verified metadata, never raw prices or booking URLs.
No normalized offer is emitted and no quote timestamp is fabricated.

Before implementing transport, verify the POST contract and actual sample price
shape, then add mocked transport tests for 401/403/429, network errors and bounded
fetch/body timeouts. Only then use process.env.INTUI_API_KEY within a server-only
execution boundary, requiring INTUI_LIVE_ENABLED='true' as well. Configuration
alone cannot activate this scaffold. Store credentials through Lovable's secure
Project Settings form, never chat. No actual API call was made during development.

Booking stays disabled until Travelpayouts confirms attribution through its link
generator. Do not turn info.intuiUrlOrderSingle into an active untracked link.