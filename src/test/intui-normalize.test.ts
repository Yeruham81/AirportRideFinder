import { describe, expect, it, vi } from "vitest";
import { LOCATIONS } from "@/data/locations";
import type { TransferSearchRequest } from "@/domain/types";
import { createIntuiAdapter } from "@/providers/intui/adapter.server";
import { buildIntuiGeoRequest } from "@/providers/intui/request";
import { normalizeIntuiOffers } from "@/providers/intui/normalize";

const pickup = LOCATIONS.find((l) => l.id === "lhr")!;
const dropoff = LOCATIONS.find((l) => l.id === "central-london")!;
const request: TransferSearchRequest = {
  pickupId: "lhr", dropoffId: "central-london",
  localDate: "2026-12-15", localTime: "10:05", timeZone: "Europe/London",
  passengers: 2, luggage: 2, preferredCurrency: null,
};
const query = buildIntuiGeoRequest(request, pickup, dropoff);
const context = {
  searchRef: "lhr|central-london|2026-12-15|10:05|2|2",
  retrievedAt: "2026-12-01T08:00:00.000Z",
  passengers: 2, luggage: 2,
};
const standard = {
  info: {
    productid: 876543219, vehicle_type: "private", perperson: false,
    maxpax: "4", luggage: 3, vehicle_class: "Standard",
    type_vehicle: "Sedan", free_cancellation: "24",
    intuiUrlOrderSingle: "https://www.intui.travel/order/private/opaque",
  },
  pricing: { allprice: { USD: 49.5 }, allnettoprice: { USD: 39.5 } },
  additional: { meet_greet: 1 },
};
const body = (rows: unknown[]) => ({
  status: "ok", response: {
    someOpaqueRoute: { LocationInfo: { distance: 27 }, travelling: rows },
  },
});
const withInfo = (changes: Record<string, unknown>) => ({
  ...standard, info: { ...standard.info, ...changes },
});
const withPrice = (value: unknown) => ({
  ...standard, pricing: { ...standard.pricing, allprice: { USD: value } },
});

describe("Intui offer normalization — pure and conservative", () => {
  it("parses documented total-price USD without assuming included fees or enabling bookings", () => {
    const result = normalizeIntuiOffers(body([standard]), query, context);
    expect(result.status).toBe("ok");
    expect(result.omittedCount).toBe(0);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      id: `intui:${context.searchRef}:0`,
      providerId: "intui", providerOfferId: "876543219",
      category: "standard_sedan", maxPassengers: 4, maxLuggage: 3,
      price: { quotedPrice: { currency: "USD", minor: 4950 }, displayPrice: null, taxesAndFees: "unknown" },
      cancellation: { kind: "free_until", hoursBefore: 24 },
      meetAndGreet: true, waitingTimeMins: null,
      source: "live", quote: { kind: "live", retrievedAt: context.retrievedAt, expiresAt: null },
      actionable: false, bookingRef: "disabled",
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("intui.travel/order");
    expect(serialized).not.toContain("allnettoprice");
  });

  it("accepts opaque string Intui product IDs and rejects unsafe identifiers", () => {
    const valid = withInfo({ productid: "VAN-AB_456:2/STD" });
    const result = normalizeIntuiOffers(body([valid, valid]), query, context);
    expect(result.status).toBe("ok");
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      providerOfferId: "VAN-AB_456:2/STD",
      id: "intui:" + context.searchRef + ":0",
      actionable: false,
    });
    const invalid = [
      withInfo({ productid: "" }),
      withInfo({ productid: "   " }),
      withInfo({ productid: "bad\nid" }),
      withInfo({ productid: "https://intui.travel/order" }),
      withInfo({ productid: "x".repeat(257) }),
    ];
    expect(normalizeIntuiOffers(body(invalid), query, context).offers).toHaveLength(0);
  });

  it("rejects bad, ambiguous, fractional-cent and currency-mismatched prices", () => {
    for (const value of [-1, 0, Number.NaN, 49.999, "49.50", null, 1e22]) {
      const result = normalizeIntuiOffers(body([withPrice(value)]), query, context);
      expect(result.status).toBe("no_verified_offers");
      expect(result.offers).toHaveLength(0);
      expect(result.omittedCount).toBe(1);
    }
    const onlyEUR = { ...standard, pricing: { allprice: { EUR: 29 } } };
    expect(normalizeIntuiOffers(body([onlyEUR]), query, context).offers).toHaveLength(0);
  });

  it("enforces required capacity, route type and stable provider identity", () => {
    const invalid = [
      withInfo({ maxpax: "1" }),
      withInfo({ luggage: 1 }),
      withInfo({ vehicle_type: "shuttle", perperson: true }),
      withInfo({ perperson: true }),
      withInfo({ productid: null }),
      withInfo({ productid: "https://provider.example/offer" }),
      withInfo({ maxpax: "4 passengers" }),
      withInfo({ type_vehicle: "Boat", vehicle_class: "Boat" }),
      withInfo({ type_vehicle: "SUV", vehicle_class: "N/a" }),
    ];
    const result = normalizeIntuiOffers(body(invalid), query, context);
    expect(result.status).toBe("no_verified_offers");
    expect(result.omittedCount).toBe(invalid.length);
    expect(result.offers).toHaveLength(0);
  });

  it("recognizes only documented comparable road classes and de-duplicates offer IDs", () => {
    const entries = [
      withInfo({ productid: 10, vehicle_class: "Economy class" }),
      withInfo({ productid: 11, vehicle_class: "Business" }),
      withInfo({ productid: 12, vehicle_class: "Luxury", type_vehicle: "Limousine" }),
      withInfo({ productid: 13, vehicle_class: "Standard", type_vehicle: "Minivan" }),
      withInfo({ productid: 14, vehicle_class: "Standard", type_vehicle: "Minibus" }),
      withInfo({ productid: 14, vehicle_class: "Standard", type_vehicle: "Minibus" }),
      withInfo({ productid: 15, vehicle_class: "Boat", type_vehicle: "Minivan" }),
    ];
    const r = normalizeIntuiOffers(body(entries), query, context);
    expect(r.status).toBe("ok");
    expect(r.offers.map((o) => o.category)).toEqual([
      "economy_sedan", "business_sedan", "executive", "minivan", "minibus",
    ]);
    expect(r.omittedCount).toBe(2);
  });

  it("does not claim refundable cancellation when free_cancellation is zero or malformed", () => {
    const r = normalizeIntuiOffers(body([
      withInfo({ productid: 1, free_cancellation: "0" }),
      withInfo({ productid: 2, free_cancellation: "unknown" }),
    ]), query, context);
    expect(r.offers.map((o) => o.cancellation)).toEqual([
      { kind: "unknown" }, { kind: "unknown" },
    ]);
  });

  it("distinguishes genuinely empty success from malformed and nonempty unverified responses", () => {
    expect(normalizeIntuiOffers(body([]), query, context).status).toBe("no_offers");
    expect(normalizeIntuiOffers({ status: "ok", response: {} }, query, context).status).toBe("malformed_response");
    expect(normalizeIntuiOffers(body([withInfo({ vehicle_type: "shuttle" })]), query, context).status).toBe("no_verified_offers");
  });
});

describe("Intui server adapter — all network calls are mocked", () => {
  const env = { INTUI_API_KEY: "only-test-placeholder", INTUI_LIVE_ENABLED: "true" };
  it("still stays disabled by default even if the environment enables Intui", async () => {
    const f = vi.fn();
    const adapter = createIntuiAdapter(LOCATIONS, { env, fetchImpl: f as unknown as typeof fetch });
    const result = await adapter.search(request, { searchRef: context.searchRef });
    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("integration_disabled");
    expect(f).not.toHaveBeenCalled();
  });

  it("searches through an opted-in adapter and returns a non-actionable live quote", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body([standard])), { status: 200 }));
    const adapter = createIntuiAdapter(LOCATIONS, {
      enabled: true, env, fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date(context.retrievedAt),
    });
    const result = await adapter.search(request, { searchRef: context.searchRef });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ok");
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]?.source).toBe("live");
    expect(result.offers[0]?.actionable).toBe(false);
    expect(result.offers[0]?.price.taxesAndFees).toBe("unknown");
  });

  it("does not return a false no-offers response for unusable nonempty data", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(body([withPrice("not a total price")])), { status: 200 }));
    const adapter = createIntuiAdapter(LOCATIONS, {
      enabled: true, env, fetchImpl: f as unknown as typeof fetch,
    });
    const result = await adapter.search(request, { searchRef: context.searchRef });
    expect(result.status).toBe("error");
    expect(result.error?.code).toBe("unverified_price_contract");
    expect(result.offers).toHaveLength(0);
  });

  it("does not request Intui with an absent server secret", async () => {
    const f = vi.fn();
    const adapter = createIntuiAdapter(LOCATIONS, {
      enabled: true,
      env: { INTUI_LIVE_ENABLED: "true" },
      fetchImpl: f as unknown as typeof fetch,
    });
    const result = await adapter.search(request, { searchRef: context.searchRef });
    expect(result.error?.code).toBe("missing_secret");
    expect(f).not.toHaveBeenCalled();
  });
});
