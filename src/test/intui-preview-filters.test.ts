import { describe, expect, it } from "vitest";
import type { NormalizedTransferOffer, VehicleCategory } from "@/domain/types";
import { parsePreviewPrice, selectIntuiPreviewOffers, type IntuiPreviewFilters } from "@/search/intui-preview-filters";

function offer(
  id: string,
  category: VehicleCategory,
  price: number,
  seats = 4,
  bags = 2,
  currency = "USD",
): NormalizedTransferOffer {
  return {
    id,
    providerId: "intui",
    providerOfferId: id,
    searchRef: "test-search",
    category,
    providerVehicleLabel: "Private vehicle",
    maxPassengers: seats,
    maxLuggage: bags,
    price: { quotedPrice: { currency, minor: price }, displayPrice: null, taxesAndFees: "unknown" },
    cancellation: { kind: "unknown" },
    waitingTimeMins: null,
    meetAndGreet: null,
    conditions: [],
    bookingRef: "disabled",
    source: "live",
    quote: { kind: "live", retrievedAt: "2026-11-05T12:00:00.000Z", expiresAt: null },
    actionable: false,
  };
}
const results = [
  offer("business", "business_sedan", 31550, 3, 3),
  offer("minivan", "minivan", 12924, 6, 5),
  offer("standard", "standard_sedan", 19155, 5, 5),
  offer("economy", "economy_sedan", 12303, 3, 3),
];
const base: IntuiPreviewFilters = {
  category: "all",
  passengers: 2,
  luggage: 2,
  minPriceMinor: null,
  maxPriceMinor: null,
  sort: "price_asc",
};

describe("Intui read-only sorting and filters", () => {
  it("defaults to low-to-high price independent of provider ordering", () => {
    expect(selectIntuiPreviewOffers(results, base).map((o) => o.id))
      .toEqual(["economy", "minivan", "standard", "business"]);
    // Original API array stays immutable.
    expect(results.map((o) => o.id)).toEqual(["business", "minivan", "standard", "economy"]);
  });

  it("also supports highest-price-first and preserves input ordering for price ties", () => {
    expect(selectIntuiPreviewOffers(results, { ...base, sort: "price_desc" }).map((o) => o.id))
      .toEqual(["business", "standard", "minivan", "economy"]);
    const tied = [offer("b", "minibus", 10000), offer("a", "standard_sedan", 10000)];
    expect(selectIntuiPreviewOffers(tied, base).map((o) => o.id)).toEqual(["b", "a"]);
  });

  it("filters by selected exact vehicle category", () => {
    expect(selectIntuiPreviewOffers(results, { ...base, category: "minivan" }).map((o) => o.id))
      .toEqual(["minivan"]);
  });

  it("independently filters by number of seats and bags", () => {
    expect(selectIntuiPreviewOffers(results, { ...base, passengers: 5 }).map((o) => o.id))
      .toEqual(["minivan", "standard"]);
    expect(selectIntuiPreviewOffers(results, { ...base, luggage: 5 }).map((o) => o.id))
      .toEqual(["minivan", "standard"]);
    expect(selectIntuiPreviewOffers(results, { ...base, passengers: 6, luggage: 5 }).map((o) => o.id))
      .toEqual(["minivan"]);
    expect(selectIntuiPreviewOffers(results, { ...base, passengers: 7 })).toEqual([]);
  });

  it("enforces inclusive minimum and maximum prices in exact minor units", () => {
    const filter = { ...base, minPriceMinor: 12924, maxPriceMinor: 19155 };
    expect(selectIntuiPreviewOffers(results, filter).map((o) => o.id))
      .toEqual(["minivan", "standard"]);
    expect(selectIntuiPreviewOffers(results, { ...base, maxPriceMinor: 12302 })).toEqual([]);
  });

  it("applies all constraints together without inventing offers", () => {
    const output = selectIntuiPreviewOffers(results, {
      ...base, category: "standard_sedan", passengers: 4, luggage: 4,
      minPriceMinor: 19000, maxPriceMinor: 20000,
    });
    expect(output.map((o) => o.id)).toEqual(["standard"]);
    expect(output[0]?.actionable).toBe(false);
  });

  it("never displays fictional or other providers in live Intui selection", () => {
    const mock = { ...offer("mock", "standard_sedan", 1), source: "mock" as const };
    const other = { ...offer("foreign", "standard_sedan", 1), providerId: "different" };
    expect(selectIntuiPreviewOffers([...results, mock, other], base).length).toBe(results.length);
  });

  it("does not numerically rank different currencies", () => {
    const mixed = [offer("eur", "minivan", 100, 4, 2, "EUR"), offer("usd", "minivan", 90, 4, 2, "USD")];
    expect(selectIntuiPreviewOffers(mixed, base).map((o) => o.id)).toEqual(["eur", "usd"]);
  });
});

describe("Exact decimal preview price bounds", () => {
  it("accepts empty and precise nonnegative USD/EUR amounts", () => {
    expect(parsePreviewPrice("", "USD")).toBe(null);
    expect(parsePreviewPrice("  ", "USD")).toBe(null);
    expect(parsePreviewPrice("0", "USD")).toBe(0);
    expect(parsePreviewPrice("123", "USD")).toBe(12300);
    expect(parsePreviewPrice("123.03", "USD")).toBe(12303);
    expect(parsePreviewPrice(" 7.5 ", "EUR")).toBe(750);
  });

  it("rejects negative, excessive precision, syntax errors and overflowing values", () => {
    for (const value of ["-5", "1.999", "1.", ".25", "1,000", "Infinity", "2e3", "9007199254740991"]) {
      expect(parsePreviewPrice(value, "USD")).toBe(undefined);
    }
  });
});
