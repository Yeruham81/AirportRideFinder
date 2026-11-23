import { describe, expect, it, vi } from "vitest";
import {
  alpsSeasonalBagMode, AlpsQuoteLimiter, fetchAlpsPublicQuote, parseAlpsPublicQuote,
} from "@/providers/alps2alps/public-quote";
import { alpsQuery, alpsResponse, alpsResponseForUrl } from "./alps-public-fixtures";

describe("Alps2Alps response-driven baggage policy", () => {
  it("resolves the supplier mode from default bag counts, never calendar dates", () => {
    expect(alpsSeasonalBagMode({ normal_suitcases: 0, ski_bags: 2 })).toBe("winter");
    expect(alpsSeasonalBagMode({ normal_suitcases: 2, ski_bags: 0 })).toBe("summer");
    for (const value of [null, {}, { normal_suitcases: 0, ski_bags: 0 },
      { normal_suitcases: 2, ski_bags: 2 }, "2031-01-16"]) {
      expect(alpsSeasonalBagMode(value)).toBeNull();
    }
  });

  it("discovers winter and requests 2 suitcases + 2 ski bags as ski_bags=4", async () => {
    const fetchImpl = vi.fn(async (url: string) => Response.json(alpsResponseForUrl(url, "winter")));
    const result = await fetchAlpsPublicQuote(alpsQuery, { fetchImpl: fetchImpl as unknown as typeof fetch, limiter: new AlpsQuoteLimiter() });
    if (result.status !== "ok") throw Error(result.status);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [discovery, final] = fetchImpl.mock.calls.map(([url]) => new URL(url));
    expect(discovery!.searchParams.has("ski_bags")).toBe(false);
    expect(discovery!.searchParams.has("luggage")).toBe(false);
    expect(final!.searchParams.get("ski_bags")).toBe("4");
    expect(final!.searchParams.get("luggage")).toBe("0");
    expect(result).toMatchObject({ bagMode: "winter", luggage: 0, skiBags: 4 });
    expect(result.offers[0]!.price.minor).toBe(27249);
    for (const [, init] of fetchImpl.mock.calls as unknown as [string, RequestInit][]) {
      expect(init).toMatchObject({ method: "GET", cache: "no-store", credentials: "omit" });
    }
  });

  it("honours a supplier season change even when January resolves to summer", async () => {
    const query = { ...alpsQuery, skiBags: 0, luggage: 3 };
    const fetchImpl = vi.fn(async (url: string) => Response.json(alpsResponseForUrl(url, "summer")));
    const result = await fetchAlpsPublicQuote(query, { fetchImpl: fetchImpl as unknown as typeof fetch, limiter: new AlpsQuoteLimiter() });
    expect(result).toMatchObject({ status: "ok", bagMode: "summer", luggage: 3, skiBags: 0 });
    expect(new URL(fetchImpl.mock.calls[1]![0]).searchParams.get("luggage")).toBe("3");
  });

  it("keeps zero-bag winter searches at zero so the supplier can return sedans", async () => {
    const query = { ...alpsQuery, luggage: 0, skiBags: 0 };
    const fetchImpl = vi.fn(async (url: string) => Response.json(alpsResponseForUrl(url, "winter")));
    expect(await fetchAlpsPublicQuote(query, { fetchImpl: fetchImpl as unknown as typeof fetch, limiter: new AlpsQuoteLimiter() }))
      .toMatchObject({ status: "ok", skiBags: 0 });
    const final = new URL(fetchImpl.mock.calls[1]![0]);
    expect(final.searchParams.get("ski_bags")).toBe("0");
    expect(final.searchParams.get("ski")).toBe("0");
  });

  it("retains summer ski requirements and stops rather than presenting an incomplete quote", async () => {
    const fetchImpl = vi.fn(async (url: string) => Response.json(alpsResponseForUrl(url, "summer")));
    expect(await fetchAlpsPublicQuote(alpsQuery, { fetchImpl: fetchImpl as unknown as typeof fetch, limiter: new AlpsQuoteLimiter() }))
      .toEqual({ status: "ski_unavailable" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects ambiguous season discovery and changed trip details before requesting a final price", async () => {
    for (const invalid of ["season", "passengers"]) {
      const body = alpsResponse(alpsQuery, "winter", true);
      if (invalid === "season") body.outbound.luggage.ski_bags = 0;
      else body.passengers.children = 0;
      const fetchImpl = vi.fn(async () => Response.json(body));
      const result = await fetchAlpsPublicQuote(alpsQuery, { fetchImpl: fetchImpl as unknown as typeof fetch, limiter: new AlpsQuoteLimiter() });
      expect(result.status).toBe(invalid === "season" ? "season_unavailable" : "quote_mismatch");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("rejects an ignored or partially reduced final bag count", () => {
    for (const count of [0, 1, 3]) {
      const body = alpsResponse(); body.outbound.luggage.ski_bags = count;
      expect(parseAlpsPublicQuote(body, alpsQuery, "winter")).toMatchObject({
        status: "quote_mismatch", field: "ski_bags", requested: 4, quoted: count,
      });
    }
    const query = { ...alpsQuery, skiBags: 0 };
    const body = alpsResponse(query, "summer"); body.outbound.luggage.normal_suitcases = 0;
    expect(parseAlpsPublicQuote(body, query, "summer")).toMatchObject({
      status: "quote_mismatch", field: "suitcases", requested: 2, quoted: 0,
    });
  });
});
