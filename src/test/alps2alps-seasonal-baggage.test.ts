import { describe, expect, it } from "vitest";
import {
  alpsSeasonalBagMode, buildAlpsPublicQuoteUrl,
  parseAlpsPublicQuote, type AlpsPublicQuoteQuery,
} from "@/providers/alps2alps/public-quote";

const base: AlpsPublicQuoteQuery = {
  from: "airport-1", to: "resort-11",
  date: "2027-01-22", time: "14:00",
  passengers: 3, luggage: 3, skiBags: 3, currency: "EUR",
};
function quote(query: AlpsPublicQuoteQuery, suitcases: number, skiBags: number) {
  return {
    currency: query.currency,
    route: {
      from_code: query.from, to_code: query.to,
      from: "Geneva Airport", to: "Chamonix",
    },
    passengers: { adults: query.passengers },
    outbound: {
      pick_up_date_time: `${query.date} ${query.time}:00`,
      luggage: {
        normal_suitcases: suitcases,
        ski_bags: skiBags,
      },
      vehicles: [{
        vehicle_type_id: 2, name: "Economy", price: 149.50,
        max_passengers: 4, max_luggage: 8, offer_code: "requested",
      }],
    },
  };
}

describe("Alps2Alps observed seasonal baggage policy (non-contractual dates)", () => {
  it("uses observed 1 December and 1 May cutovers, including year wrap", () => {
    for (const d of ["2026-12-01", "2026-12-31", "2027-01-01", "2027-04-30", "2028-02-29"]) {
      expect(alpsSeasonalBagMode(d)).toBe("winter");
    }
    for (const d of ["2026-11-13", "2026-11-30", "2027-05-01", "2027-10-31", "2027-11-01"]) {
      expect(alpsSeasonalBagMode(d)).toBe("summer");
    }
    for (const d of ["", "2027-02-30", "junk", "2027-13-01"]) {
      expect(alpsSeasonalBagMode(d)).toBeNull();
    }
  });

  it("normalizes dropped winter suitcases only with an explicit exclusion object and no booking", () => {
    const r = parseAlpsPublicQuote(quote(base, 0, 3), base);
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw Error();
    expect(r.suitcaseAdjustment).toEqual({ requestedSuitcases: 3, quotedSuitcases: 0 });
    expect(r.bagAdjustment).toBeUndefined();
    expect(r.luggage).toBe(0);
    expect(r.skiBags).toBe(3);
    expect(r.offers).toHaveLength(1);
    expect(r.offers[0]).toMatchObject({
      price: { currency: "EUR", minor: 14950 }, actionable: false,
    });
    expect(JSON.stringify(r)).not.toContain("booking_url");
  });

  it("accepts either season's zero-other-bag quote without requiring corrections", () => {
    const winter: AlpsPublicQuoteQuery = { ...base, luggage: 0 };
    const summer: AlpsPublicQuoteQuery = {
      ...base, date: "2027-07-22", luggage: 3, skiBags: 0,
    };
    for (const [q, suitcases, skis] of [
      [winter, 0, 3], [summer, 3, 0],
    ] as const) {
      const url = new URL(buildAlpsPublicQuoteUrl(q));
      expect(url.searchParams.get("luggage")).toBe(String(suitcases));
      expect(url.searchParams.get("ski_bags")).toBe(String(skis));
      const r = parseAlpsPublicQuote(quote(q, suitcases, skis), q);
      expect(r.status).toBe("ok");
      if (r.status !== "ok") throw Error();
      expect(r.suitcaseAdjustment).toBeUndefined();
      expect(r.bagAdjustment).toBeUndefined();
    }
  });

  it("does not accept arbitrary partial bag reductions or different passenger details", () => {
    const partial = parseAlpsPublicQuote(quote(base, 2, 3), base);
    expect(partial).toEqual({
      status: "quote_mismatch", field: "suitcases", requested: 3, quoted: 2,
    });
    const wrongSkis = parseAlpsPublicQuote(quote(base, 0, 1), base);
    expect(wrongSkis).toEqual({
      status: "quote_mismatch", field: "ski_bags", requested: 3, quoted: 1,
    });
    const wrongPassengers = {
      ...quote(base, 0, 3), passengers: { adults: 4 },
    };
    expect(parseAlpsPublicQuote(wrongPassengers, base))
      .toEqual({ status: "quote_mismatch", field: "passengers" });
  });
});
