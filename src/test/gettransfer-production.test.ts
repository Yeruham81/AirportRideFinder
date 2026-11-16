import { describe, expect, it, vi } from "vitest";
import { buildProductionRouteInfoUrl, productionRouteInfo } from "@/providers/gettransfer/production-client.server";
import { visibleProductionPrices } from "@/providers/gettransfer/production-prices";
import { buildGetTransferPreviewQuery } from "@/providers/gettransfer/preview-query";
import { parseRouteInfo } from "@/providers/gettransfer/route-info";

const TOKEN = "mock-production-token-not-real";
const QUERY = buildGetTransferPreviewQuery({
  routeId: "london", date: "2026-12-15", time: "14:00", passengers: 2,
}, new Date("2026-11-16T12:00:00Z"))!.query;

const sample = {
  result: "success",
  data: {
    success: true,
    prices: {
      economy: { min: "US$19", book_now: "US$48" },
      business: { min: "US$24" },
      van: { min: "US$70", book_now: "US$110" },
      suv: {},
    },
  },
};

describe("GetTransfer production client (mock-only, no real network)", () => {
  it("sends an allowlisted HTTPS read-only request, with no token in the URL", async () => {
    const url = new URL(buildProductionRouteInfoUrl(QUERY));
    expect(url.origin).toBe("https://gettransfer.com");
    expect(url.pathname).toBe("/api/route_info");
    expect(url.searchParams.get("with_prices")).toBe("true");
    expect(url.searchParams.getAll("points[]")).toHaveLength(2);
    const fake = vi.fn(async () => Response.json(sample));
    const result = await productionRouteInfo(QUERY, { token: TOKEN, fetchImpl: fake });
    expect(result.status).toBe("ok");
    const [requestedUrl, init] = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(requestedUrl).toBe(url.toString());
    expect(requestedUrl).not.toContain(TOKEN);
    expect(init.method).toBe("GET");
    expect(init.redirect).toBe("manual");
    expect((init.headers as Record<string, string>)["X-ACCESS-TOKEN"]).toBe(TOKEN);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("never calls the network without the production token", async () => {
    const fake = vi.fn();
    expect(await productionRouteInfo(QUERY, {
      token: undefined, fetchImpl: fake as unknown as typeof fetch,
    })).toEqual({ status: "missing_token" });
    expect(fake).not.toHaveBeenCalled();
  });

  it("does not follow redirects or expose server response bodies", async () => {
    const redir = vi.fn(async () => new Response(null, {
      status: 302, headers: { Location: "https://another-host.example" },
    }));
    expect(await productionRouteInfo(QUERY, { token: TOKEN, fetchImpl: redir }))
      .toEqual({ status: "redirect_blocked" });
    expect(await productionRouteInfo(QUERY, { token: TOKEN,
      fetchImpl: vi.fn(async () => Response.json({ secret: TOKEN }, { status: 401 })),
    })).toEqual({ status: "unauthorized", httpStatus: 401 });
  });

  it("classifies HTTP 403 without exposing provider errors, response bodies or secrets", async () => {
    const response = new Response(`<html>${TOKEN}</html>`, {
      status: 403,
      headers: {
        "content-type": "text/html; charset=UTF-8",
        server: "cloudflare",
        "cf-ray": "7cafe1234abc-LHR",
      },
    });
    const result = await productionRouteInfo(QUERY, {
      token: TOKEN,
      fetchImpl: vi.fn(async () => response),
    });
    expect(result).toEqual({
      status: "forbidden",
      httpStatus: 403,
      diagnostic: { responseKind: "html", cloudflare: true, cfRay: "7cafe1234abc-LHR" },
    });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    const api = await productionRouteInfo(QUERY, {
      token: TOKEN,
      fetchImpl: vi.fn(async () => Response.json({ error: TOKEN }, { status: 403 })),
    });
    expect(api).toEqual({
      status: "forbidden",
      httpStatus: 403,
      diagnostic: { responseKind: "json", cloudflare: false, cfRay: null },
    });
    expect(JSON.stringify(api)).not.toContain(TOKEN);
  });

  it("keeps indicative minimums and Book Now prices separate", () => {
    const diagnostics = parseRouteInfo(sample, "USD")!;
    const offers = visibleProductionPrices(diagnostics.prices);
    expect(offers.map((o) => o.type)).toEqual(["economy", "business", "van"]);
    expect(offers[0]).toEqual({
      type: "economy", indicativeMin: "US$19", bookNow: { currency: "USD", minor: 4800 },
    });
    expect(offers[1]).toEqual({
      type: "business", indicativeMin: "US$24", bookNow: null,
    });
    expect(offers[2]?.bookNow?.minor).toBe(11000);
  });

  it("never promotes indicative or mismatched-currency values to bookable prices", () => {
    const diagnostics = parseRouteInfo({ data: { success: true, prices: {
      economy: { min: "US$20", book_now: "€55" },
      comfort: { min: "US$40" },
    } } }, "USD")!;
    const prices = visibleProductionPrices(diagnostics.prices);
    expect(prices).toHaveLength(2);
    expect(prices.every((p) => p.bookNow === null)).toBe(true);
  });
});
