import { describe, expect, it, vi } from "vitest";
import {
  ALPS_PUBLIC_QUOTE_ENDPOINT,
  buildAlpsPublicQuoteUrl,
  fetchAlpsPublicQuote,
  parseAlpsPublicQuote,
  validateAlpsPublicQuery,
} from "@/providers/alps2alps/public-quote";

const query = { date: "2030-12-20", time: "14:30", passengers: 2, luggage: 2 };
const sample = {
  disclaimer: "Public quote engine",
  quote_url: "https://booking.alps2alps.com/book/quick-search?unsafe=example",
  route: {
    from_code: "airport-1",
    to_code: "resort-11",
    from: "Geneva Airport",
    to: "Chamonix",
  },
  currency: "EUR",
  passengers: { adults: 2, children: 0 },
  outbound: {
    pick_up_date_time: "2030-12-20 14:30:00",
    luggage: { normal_suitcases: 2, ski_bags: 0, ski_equipment: 0 },
    vehicles: [
      {
        vehicle_type_id: 11, name: "XL minivan",
        price: 258.25, max_passengers: 8,
        max_luggage: 8, offer_code: "requested",
        booking_url: "https://booking.alps2alps.com/book/quick-checkout?unsafe=example",
      },
      {
        vehicle_type_id: 4, name: "VIP",
        price: 300, max_passengers: 7,
        max_luggage: 7, offer_code: "requested",
      },
      {
        vehicle_type_id: 2, name: "Offpeak",
        price: 100, offer_code: "off_peak",
      },
    ],
  },
  return: null,
};

describe("Alps2Alps public GET quote-only client", () => {
  it("constructs only the documented public, stateless GET quote URL", () => {
    expect(ALPS_PUBLIC_QUOTE_ENDPOINT).toBe(
      "https://booking.alps2alps.com/api/public/v1/transfer-options");
    const url = new URL(buildAlpsPublicQuoteUrl(query));
    expect(url.origin).toBe("https://booking.alps2alps.com");
    expect(url.pathname).toBe("/api/public/v1/transfer-options");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: "airport-1", to: "resort-11", date: "2030-12-20",
      time: "14:30", adults: "2", luggage: "2", ski_bags: "0",
      is_flight: "0", currency: "EUR",
    });
    for (const forbidden of ["pc", "promo", "promo_code", "booking_url", "api_key", "api_secret"]) {
      expect(url.searchParams.has(forbidden)).toBe(false);
    }
  });

  it("rejects invalid pickup dates, unbounded baggage or passengers before fetch", async () => {
    expect(validateAlpsPublicQuery(query, new Date("2026-11-06T00:00:00Z"))).toBe(true);
    for (const q of [
      { ...query, date: "2020-12-20" }, { ...query, time: "25:00" },
      { ...query, passengers: 0 }, { ...query, luggage: 9 },
      { ...query, luggage: -1 }, { ...query, luggage: 2.5 },
    ]) {
      expect(validateAlpsPublicQuery(q)).toBe(false);
      expect(() => buildAlpsPublicQuoteUrl(q)).toThrow("Invalid");
    }
    const f = vi.fn();
    expect(await fetchAlpsPublicQuote({ ...query, luggage: -1 },
      { fetchImpl: f as unknown as typeof fetch })).toEqual({ status: "invalid" });
    expect(f).not.toHaveBeenCalled();
  });

  it("normalizes only selected-time live offers and strips all checkout links", () => {
    const r = parseAlpsPublicQuote(sample, query);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error();
    expect(r.offers.map(x => x.price.minor)).toEqual([25825, 30000]);
    expect(r.offers.map(x => x.vehicleLabel)).toEqual(["XL minivan", "VIP"]);
    expect(r.offers[0]).toMatchObject({
      source: "public_live", actionable: false,
      maxPassengers: 8, maxLuggage: 8,
      pickupTime: "2030-12-20 14:30:00",
    });
    expect(r.luggage).toBe(2);
    expect(r.skiBags).toBe(0);
    expect(JSON.stringify(r)).not.toContain("quick-checkout");
    expect(JSON.stringify(r)).not.toContain("quick-search");
    expect(JSON.stringify(r)).not.toContain("booking_url");
  });

  it("rejects mismatched route, currency, group size and nonliteral pickup time", () => {
    const changed = (patch: Record<string, unknown>) =>
      parseAlpsPublicQuote({ ...sample, ...patch }, query);
    expect(changed({ currency: "USD" }).status).toBe("malformed_response");
    expect(changed({ passengers: { adults: 3 } }).status).toBe("malformed_response");
    expect(changed({ route: { from_code: "airport-2", to_code: "resort-11" } }).status)
      .toBe("malformed_response");
    expect(changed({ outbound: { ...sample.outbound, pick_up_date_time: "2030-12-20 13:00:00" } }).status)
      .toBe("malformed_response");
    expect(changed({ outbound: { ...sample.outbound, luggage: undefined } }).status)
      .toBe("malformed_response");
  });

  it("omits unsupported or malformed offer entries rather than fabricating prices", () => {
    const r = parseAlpsPublicQuote({
      ...sample, outbound: { ...sample.outbound, vehicles: [
        { vehicle_type_id: 1, name: "Invalid", price: "USD 500", offer_code: "requested" },
        { vehicle_type_id: 2, name: "Invalid", price: -200, offer_code: "requested" },
        { vehicle_type_id: 3, name: "Unknown capacity", price: 99.5, offer_code: "requested" },
      ] },
    }, query);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error();
    expect(r.offers).toHaveLength(1);
    expect(r.offers[0]).toMatchObject({
      vehicleLabel: "Unknown capacity", maxPassengers: null, maxLuggage: null,
      price: { currency: "EUR", minor: 9950 },
    });
  });

  it("GETs public endpoint only and emits no raw link or provider payload to the page", async () => {
    const f = vi.fn(async () => Response.json(sample));
    const r = await fetchAlpsPublicQuote(query, { fetchImpl: f as unknown as typeof fetch });
    expect(r.status).toBe("ok");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/api/public/v1/transfer-options?");
    expect(init).toMatchObject({
      method: "GET", mode: "cors", cache: "no-store",
      redirect: "error", credentials: "omit",
    });
    expect(init).not.toHaveProperty("body");
    expect(JSON.stringify(r)).not.toContain("booking_url");
  });

  it("returns safe errors on server error, CORS network failure, rate limit and invalid JSON", async () => {
    for (const [code, expected] of [
      [404, "route_unavailable"], [422, "route_unavailable"],
      [429, "rate_limited"], [500, "http_error"],
    ] as const) {
      const f = vi.fn(async () => new Response(null, { status: code }));
      const r = await fetchAlpsPublicQuote(query, { fetchImpl: f as unknown as typeof fetch });
      expect(r.status).toBe(expected);
    }
    const rejected = vi.fn(async () => { throw new TypeError("sensitive browser error"); });
    expect(await fetchAlpsPublicQuote(query, {
      fetchImpl: rejected as unknown as typeof fetch,
    })).toEqual({ status: "network_error" });
    const invalid = vi.fn(async () => new Response("not json", { status: 200 }));
    expect(await fetchAlpsPublicQuote(query, {
      fetchImpl: invalid as unknown as typeof fetch,
    })).toEqual({ status: "malformed_response" });
  });

  it("does not silently treat empty requested-time offers as prices", () => {
    const r = parseAlpsPublicQuote({
      ...sample,
      outbound: { ...sample.outbound, vehicles: [
        { vehicle_type_id: 9, price: 10, name: "Off-peak", offer_code: "off_peak" },
      ] },
    }, query);
    expect(r).toEqual({ status: "no_offers" });
  });
});
