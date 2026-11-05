import { describe, expect, it } from "vitest";
import type { NormalizedTransferOffer, VehicleCategory } from "@/domain/types";
import { groupIntuiPreviewOffers, isGroupLowestPrice } from "@/search/intui-preview-groups";

function offer(id: string, category: VehicleCategory, cents: number, currency = "USD"): NormalizedTransferOffer {
  return {
    id, providerId: "intui", providerOfferId: id, searchRef: "test",
    category, providerVehicleLabel: "Vehicle", maxPassengers: 4, maxLuggage: 3,
    price: { quotedPrice: { currency, minor: cents }, displayPrice: null, taxesAndFees: "unknown" },
    cancellation: { kind: "unknown" }, waitingTimeMins: null, meetAndGreet: null,
    conditions: [], bookingRef: "disabled", source: "live",
    quote: { kind: "live", retrievedAt: "2026-11-05T12:00:00.000Z", expiresAt: null },
    actionable: false,
  };
}

describe("Intui group presentation", () => {
  it("orders categories by taxonomy and keeps selected order within each category", () => {
    const entries = [
      offer("van-expensive", "minivan", 20000),
      offer("business", "business_sedan", 30000),
      offer("van-cheap", "minivan", 10000),
      offer("economy", "economy_sedan", 9500),
    ];
    const groups = groupIntuiPreviewOffers(entries);
    expect(groups.map((g) => g.category))
      .toEqual(["economy_sedan", "business_sedan", "minivan"]);
    expect(groups[2]?.offers.map((o) => o.id)).toEqual(["van-expensive", "van-cheap"]);
    expect(groups[2]?.lowest?.id).toBe("van-cheap");
    expect(entries.map((o) => o.id))
      .toEqual(["van-expensive", "business", "van-cheap", "economy"]);
  });

  it("reports all ties as the lowest price in their category, not other currencies", () => {
    const a = offer("one", "standard_sedan", 10000);
    const b = offer("two", "standard_sedan", 10000);
    const c = offer("three", "standard_sedan", 12000);
    const group = groupIntuiPreviewOffers([c, a, b])[0];
    expect(group?.lowest?.id).toBe("one");
    expect(isGroupLowestPrice(a, group?.lowest ?? null)).toBe(true);
    expect(isGroupLowestPrice(b, group?.lowest ?? null)).toBe(true);
    expect(isGroupLowestPrice(c, group?.lowest ?? null)).toBe(false);
    expect(isGroupLowestPrice(offer("foreign", "standard_sedan", 10000, "EUR"), group?.lowest ?? null)).toBe(false);
  });

  it("does not invent a from-price when one category mixes currencies", () => {
    const groups = groupIntuiPreviewOffers([
      offer("usd", "minibus", 9000, "USD"),
      offer("eur", "minibus", 5000, "EUR"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.lowest).toBeNull();
  });

  it("excludes fictional and unrelated providers from the live category view", () => {
    const mock = { ...offer("fictional", "economy_sedan", 1), source: "mock" as const };
    const unrelated = { ...offer("other", "economy_sedan", 1), providerId: "other" };
    const groups = groupIntuiPreviewOffers([
      mock, unrelated, offer("valid", "minivan", 20000),
    ]);
    expect(groups.map((g) => g.category)).toEqual(["minivan"]);
    expect(groups[0]?.offers.map((o) => o.id)).toEqual(["valid"]);
  });
});
