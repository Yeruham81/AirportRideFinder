import { describe, expect, it, vi } from "vitest";
import {
  ALPS_PUBLIC_LOCATIONS_ENDPOINT,
  buildAlpsLocationSearchUrl, buildAlpsPublicQuoteUrl,
  fetchAlpsLocations, parseAlpsLocations, parseAlpsPublicQuote,
  validAlpsLocationCode, type AlpsPublicQuoteQuery,
} from "@/providers/alps2alps/public-quote";

const query: AlpsPublicQuoteQuery = {
  from: "airport-2", to: "resort-168", date: "2031-01-20", time: "10:15",
  passengers: 4, luggage: 5, skiBags: 2, currency: "GBP",
};
const sample = {
  currency: "GBP",
  route: {
    from_code: "airport-2", to_code: "resort-168",
    from: "Grenoble Airport", to: "Ischgl",
  },
  passengers: { adults: 4 },
  quote_url: "https://booking.alps2alps.com/book/quick-search?from=airport-2&to=resort-168&date=2031-01-20&time=10%3A15",
  outbound: {
    pick_up_date_time: "2031-01-20 10:15:00",
    luggage: { normal_suitcases: 5, ski_bags: 2, ski_equipment: 1 },
    vehicles: [
      {
        vehicle_type_id: 10, name: "Large minivan", price: "351.50",
        max_passengers: 8, max_luggage: 8, offer_code: "requested",
        booking_url: "https://booking.alps2alps.com/book/quick-checkout?from=airport-2&to=resort-168&date=2031-01-20&time=10%3A15&vehicle=10",
      },
      {
        vehicle_type_id: 4, name: "Too small", price: 200, max_passengers: 3, max_luggage: 4,
        offer_code: "requested", booking_url: "https://bad.example/checkout",
      },
      {
        vehicle_type_id: 11, name: "XL minivan", price: 275.3,
        max_passengers: 9, max_luggage: 10, offer_code: "requested",
        booking_url: "https://bad.example/checkout",
      },
      {
        vehicle_type_id: 12, name: "Offpeak minivan", price: 50, offer_code: "off_peak",
      },
    ],
  },
};

describe("Alps2Alps official dynamic public location lookup", () => {
  it("uses only documented, keyless public locations/search endpoint", () => {
    expect(ALPS_PUBLIC_LOCATIONS_ENDPOINT).toBe(
      "https://booking.alps2alps.com/api/public/v1/locations/search");
    const url = new URL(buildAlpsLocationSearchUrl("  Grenoble  "));
    expect(url.pathname).toBe("/api/public/v1/locations/search");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "Grenoble" });
    expect(url.searchParams.has("api_key")).toBe(false);
    for (const s of ["", "a", "x".repeat(81), "\nmalicious"]) {
      expect(() => buildAlpsLocationSearchUrl(s)).toThrow();
    }
  });

  it("accepts published airport/resort/city/train-station codes but never arbitrary URLs or query fragments", () => {
    for (const code of ["airport-1", "resort-168", "train_station-7", "city-46", "airport-25-w"]) {
      expect(validAlpsLocationCode(code)).toBe(true);
    }
    for (const code of [
      "", "other", "airport-0", "airportridefinder", "../transfer",
      "airport-1?promo=TEST", "https://example.com", "file://1", "train-station-1",
    ]) expect(validAlpsLocationCode(code)).toBe(false);
  });

  it("shows verified vendor locations, with country and type, without trusting arbitrary response fields", () => {
    expect(parseAlpsLocations([
      { code: "resort-644", name: "Geneva city", type: "resort", country: "Switzerland", booking_url: "https://bad.example" },
      { code: "airport-1", name: "Geneva Airport", type: "airport", country: "Switzerland" },
      { code: "city-46", name: "Geneva city", type: "city", country: "Switzerland" },
      { code: "city-46", name: "Duplicate", type: "city", country: "Switzerland" },
      { code: "airport-1", name: "Wrong type", type: "resort", country: "France" },
      { code: "javascript:alert(1)", name: "Unsafe", type: "airport", country: "France" },
      { code: "resort-99", name: "\nUnsafe label", type: "resort", country: "France" },
    ])).toEqual([
      { code: "resort-644", name: "Geneva city", type: "resort", country: "Switzerland" },
      { code: "airport-1", name: "Geneva Airport", type: "airport", country: "Switzerland" },
      { code: "city-46", name: "Geneva city", type: "city", country: "Switzerland" },
    ]);
    expect(parseAlpsLocations({ data: [] })).toBeNull();
  });

  it("makes only one GET search after manual invocation and gracefully reports rate limits", async () => {
    const f = vi.fn(async () => Response.json([
      { code: "airport-1", name: "Geneva Airport", type: "airport", country: "Switzerland" },
    ]));
    const r = await fetchAlpsLocations("gen", { fetchImpl: f as unknown as typeof fetch });
    expect(r).toMatchObject({ status: "ok", locations: [{ code: "airport-1" }] });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0]![0]).toContain("/locations/search?q=gen");
    expect(await fetchAlpsLocations("a", { fetchImpl: f as unknown as typeof fetch }))
      .toEqual({ status: "invalid" });
    expect(f).toHaveBeenCalledTimes(1);
    const limited = await fetchAlpsLocations("gen", {
      fetchImpl: vi.fn(async () => new Response(null, { status: 429 })) as unknown as typeof fetch,
    });
    expect(limited).toEqual({ status: "rate_limited" });
  });
});

describe("Alps2Alps dynamic route price quote and safe metadata", () => {
  it("preserves both provider location codes, independent ski bags and currency", () => {
    const url = new URL(buildAlpsPublicQuoteUrl(query));
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: "airport-2", to: "resort-168", date: "2031-01-20",
      time: "10:15", adults: "4", luggage: "5", ski_bags: "2",
      ski: "1", is_flight: "0", currency: "GBP",
    });
    expect(url.searchParams.has("return_date")).toBe(false);
    expect(url.searchParams.has("promo")).toBe(false);
  });

  it("quotes exact currency, route, pickup and luggage; discards all outgoing links", () => {
    const r = parseAlpsPublicQuote(sample, query);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error();
    expect(r.route).toEqual({ from: "Grenoble Airport", to: "Ischgl" });
    expect(r.offers.map(x => x.vehicleLabel)).toEqual(["XL minivan", "Large minivan"]);
    expect(r.offers.map(x => x.price)).toEqual([
      { currency: "GBP", minor: 27530 },
      { currency: "GBP", minor: 35150 },
    ]);
    expect(r.skiBags).toBe(2);
    expect(r.luggage).toBe(5);
    expect(r.linkEvidence).toEqual({ quoteUrlPresent: true, vehicleUrlsPresent: 1 });
    expect(JSON.stringify(r)).not.toContain("https://");
    expect(JSON.stringify(r)).not.toContain("booking_url");
  });

  it("rejects missing, mismatched or silently defaulted ski-bag / suitcase counts", () => {
    for (const change of [
      { currency: "EUR" }, { passengers: { adults: 3 } },
      { route: { ...sample.route, to_code: "resort-1" } },
      { outbound: { ...sample.outbound, luggage: { normal_suitcases: 5, ski_bags: 0 } } },
      { outbound: { ...sample.outbound, luggage: { normal_suitcases: 2, ski_bags: 2 } } },
      { outbound: { ...sample.outbound, pick_up_date_time: "2031-01-20 11:15:00" } },
    ]) {
      expect(parseAlpsPublicQuote({ ...sample, ...change }, query).status)
        .toBe("malformed_response");
    }
  });

  it("returns no_offers when no requested-time vehicle can fit party and baggage", () => {
    const r = parseAlpsPublicQuote({
      ...sample, outbound: { ...sample.outbound, vehicles: [sample.outbound.vehicles[1]] },
    }, query);
    expect(r).toEqual({ status: "no_offers" });
  });

  it("never marks price results actionable, even with fully valid vendor checkout URLs", () => {
    const r = parseAlpsPublicQuote(sample, query);
    if (r.status !== "ok") throw Error();
    expect(r.offers.every(x => x.actionable === false)).toBe(true);
    for (const value of r.offers) {
      expect("bookingUrl" in value).toBe(false);
      expect("bookingRef" in value).toBe(false);
    }
  });
});
