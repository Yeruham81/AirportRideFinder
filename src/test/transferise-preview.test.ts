import { describe, expect, it, vi } from "vitest";
import {
  isTransferiseSandboxKey, parseTransferiseQuote, prepareTransferiseSearch,
  resolveTransferisePlace, safeTransferiseSandboxLink, TRANSFERISE_PREVIEW_ROUTES,
  type TransferisePreviewInput,
} from "@/providers/transferise/preview";
import { searchTransferiseSandbox } from "@/providers/transferise/sandbox-client.server";

const NOW = new Date("2026-11-08T10:00:00Z");
const INPUT: TransferisePreviewInput = {
  routeId: "antalya-rixos", date: "2026-11-22", time: "14:00", passengers: 2, currency: "EUR",
};
const KEY = "tfx_test_fake_key_for_unit_tests_only";
const LINK = "https://transferise.com/search?from=airport%3A456&to=hotel%3A321&ref=p12&utm_content=api&test=1";
const airport = { ok: true, results: [
  { id: "airport:456", kind: "airport", iata: "AYT", name: "Antalya Airport", label: "Antalya Airport (AYT)" },
] };
const hotel = { ok: true, results: [
  { id: "hotel:321", kind: "hotel", name: "Rixos Downtown Antalya" },
] };
const car = {
  id: 60, name: "Standard Sedan", type: "private", pricing: "per_vehicle", max_passengers: 3,
  max_luggage: 2, price: 25.04, currency: "EUR", payment_methods: ["cash_driver", "iyzico_full"],
};
const quote = {
  ok: true, test: true, date: INPUT.date, time: INPUT.time, passengers: 2,
  round_trip: false, vehicles: [car], booking_url: LINK,
};

describe("Transferise route and quote validation", () => {
  it("validates the local pickup, actual calendar date, pax, route and currency", () => {
    expect(prepareTransferiseSearch(INPUT, NOW)?.id).toBe(INPUT.routeId);
    for (const change of [
      { date: "2026-02-30" }, { date: "2026-11-07" }, { time: "24:00" },
      { passengers: 0 }, { passengers: 1.5 }, { passengers: 17 }, { routeId: "arbitrary" },
    ]) expect(prepareTransferiseSearch({ ...INPUT, ...change }, NOW)).toBeNull();
    expect(prepareTransferiseSearch({ ...INPUT, date: "2026-11-08", time: "12:59" }, NOW)).toBeNull();
  });

  it("resolves real provider IDs and rejects ambiguous matches", () => {
    const lookup = TRANSFERISE_PREVIEW_ROUTES[0]!.from;
    expect(resolveTransferisePlace(airport, lookup)?.id).toBe("airport:456");
    expect(resolveTransferisePlace({ ...airport, results: [
      ...airport.results, { ...airport.results[0], id: "airport:999" },
    ] }, lookup)).toBeNull();
    expect(resolveTransferisePlace({ ok: true, results: [] }, lookup)).toBeNull();
    expect(resolveTransferisePlace({ ok: false, results: airport.results }, lookup)).toBeNull();
  });

  it("resolves Rixos by either documented or public catalogue name without selecting another property", () => {
    const lookup = TRANSFERISE_PREVIEW_ROUTES[0]!.to;
    // The catalogue name does not contain 'Antalya', so the search must use
    // the common stem rather than the documentation's longer label.
    const publicHotel = { id: "hotel:987", kind: "hotel", name: "Rixos Downtown Hotel" };
    expect(publicHotel.name.toLowerCase()).toContain(lookup.query.toLowerCase());
    expect(resolveTransferisePlace({ ok: true, results: [
      publicHotel,
      { id: "hotel:988", kind: "hotel", name: "Rixos Premium Belek" },
      { id: "hotel:989", kind: "hotel", name: "Rixos Downtown Hotel Annex" },
      { id: "destination:987", kind: "destination", name: "Rixos Downtown Hotel" },
    ] }, lookup)?.id).toBe("hotel:987");
    expect(resolveTransferisePlace(hotel, lookup)?.id).toBe("hotel:321");
    // Conflicting provider hotel records still require resolution; never
    // silently take the first returned ID just because both names are known.
    expect(resolveTransferisePlace({ ok: true, results: [
      publicHotel, ...hotel.results,
    ] }, lookup)).toBeNull();
  });

  it("preserves the API price in minor units without markup and preserves attribution", () => {
    const result = parseTransferiseQuote(quote, INPUT);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error();
    expect(result.offers[0]?.price).toEqual({ currency: "EUR", minor: 2504 });
    expect(result.offers[0]?.maxPassengers).toBe(3);
    expect(result.bookingUrl).toBe(LINK);
  });

  it("hides invalid prices, per-person fares, wrong currencies, duplicate IDs and small vehicles", () => {
    const result = parseTransferiseQuote({ ...quote, vehicles: [
      car, car, { ...car, id: 61, price: null }, { ...car, id: 62, price: -1 },
      { ...car, id: 63, currency: "USD" }, { ...car, id: 64, pricing: "per_person" },
      { ...car, id: 65, max_passengers: 1 }, { ...car, id: 66, price: 1.001 },
    ] }, INPUT);
    expect(result.kind === "ok" && result.offers.map((item) => item.id)).toEqual(["60"]);
  });

  it("does not invent offers for empty responses, and rejects a different search context", () => {
    expect(parseTransferiseQuote({ ...quote, vehicles: [] }, INPUT)).toMatchObject({ kind: "ok", offers: [] });
    expect(parseTransferiseQuote({ ...quote, passengers: 3 }, INPUT)).toEqual({ kind: "malformed_response" });
    expect(parseTransferiseQuote({ ...quote, date: "2026-12-22" }, INPUT)).toEqual({ kind: "malformed_response" });
    expect(parseTransferiseQuote({ ok: false, error: "secret raw upstream text" }, INPUT)).toEqual({ kind: "api_rejected" });
  });

  it("never exposes a live, unverified, foreign, credentialed or key-containing URL", () => {
    expect(safeTransferiseSandboxLink(LINK, true)).toBe(LINK);
    for (const url of [
      "http://transferise.com/search?ref=p12", "https://transferise.com.evil.test/",
      "https://evil.test/", "https://user:password@transferise.com/search", "javascript:alert(1)",
      "https://transferise.com/search?key=sensitive", "https://transferise.com/search?api_key=sensitive",
    ]) expect(safeTransferiseSandboxLink(url, true)).toBeNull();
    expect(safeTransferiseSandboxLink(LINK, false)).toBeNull();
    const unverified = { ...quote, test: undefined };
    expect(parseTransferiseQuote(unverified, INPUT)).toMatchObject({ kind: "ok", bookingUrl: null });
  });
});

describe("Transferise sandbox transport", () => {
  it("refuses a missing or live key without any network request", async () => {
    const f = vi.fn();
    for (const key of [undefined, "", "tfx_live_key", "tfx_test_", "tfx_test_invalid\nheader"]) {
      expect(isTransferiseSandboxKey(key)).toBe(false);
      expect(await searchTransferiseSandbox(INPUT, { key, fetchImpl: f, now: NOW }))
        .toEqual({ kind: "error", code: "invalid_sandbox_key" });
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("uses exactly two places GETs and one quote GET with discovered IDs and a server header", async () => {
    const f = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(airport))
      .mockResolvedValueOnce(Response.json(hotel))
      .mockResolvedValueOnce(Response.json(quote));
    const result = await searchTransferiseSandbox(INPUT, { key: KEY, fetchImpl: f, now: NOW });
    expect(result.kind).toBe("ok");
    expect(f).toHaveBeenCalledTimes(3);
    expect(f.mock.calls.map(([url]) => new URL(String(url)).searchParams.get("action")))
      .toEqual(["places", "places", "quote"]);
    for (const [url, init] of f.mock.calls) {
      expect(new URL(String(url)).origin).toBe("https://transferise.com");
      expect(init?.method).toBe("GET"); expect(init?.redirect).toBe("manual");
      expect((init?.headers as Record<string, string>)["X-Api-Key"]).toBe(KEY);
      expect(String(url)).not.toContain(KEY);
    }
    const search = new URL(String(f.mock.calls[2]![0]));
    expect(search.searchParams.get("from")).toBe("airport:456");
    expect(search.searchParams.get("to")).toBe("hotel:321");
    expect(search.searchParams.get("passengers")).toBe("2");
    expect(search.searchParams.get("currency")).toBe("EUR");
    expect(JSON.stringify(result)).not.toContain(KEY);
  });

  it("stops on an unresolved location instead of requesting an unrelated route", async () => {
    const f = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ok: true, results: [] }));
    expect(await searchTransferiseSandbox(INPUT, { key: KEY, fetchImpl: f, now: NOW }))
      .toEqual({ kind: "error", code: "location_unresolved" });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("never follows redirects with a key, and classifies authentication and DNS errors safely", async () => {
    for (const [status, code] of [[302, "redirect_blocked"], [401, "unauthorized"], [403, "forbidden"], [429, "rate_limited"]] as const) {
      const f = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
      expect(await searchTransferiseSandbox(INPUT, { key: KEY, fetchImpl: f, now: NOW }))
        .toEqual({ kind: "error", code });
      expect(f).toHaveBeenCalledTimes(1);
    }
    const f = vi.fn<typeof fetch>().mockRejectedValue(Object.assign(new Error(KEY), {
      cause: { code: "ENOTFOUND" },
    }));
    expect(await searchTransferiseSandbox(INPUT, { key: KEY, fetchImpl: f, now: NOW }))
      .toEqual({ kind: "error", code: "dns_error" });
  });
});
