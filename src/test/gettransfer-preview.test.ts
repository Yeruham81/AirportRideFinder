import { describe, expect, it, vi } from "vitest";
import { getUnambiguousLocalInstant, buildGetTransferPreviewQuery } from "@/providers/gettransfer/preview-query";
import { sandboxRouteInfo } from "@/providers/gettransfer/sandbox-client.server";

describe("GetTransfer private preview input validation", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  const valid = {
    routeId: "london", date: "2026-11-15", time: "14:00", passengers: 2,
  };

  it("builds only known airport routes with exact local time and sandbox request format", () => {
    const result = buildGetTransferPreviewQuery(valid, now)!;
    expect(result.routeLabel).toContain("Heathrow");
    expect(result.dateTo).toBe("2026-11-15T14:00:00+00:00");
    expect(result.query).toMatchObject({
      from: { lat: 51.47, lng: -0.4543 },
      to: { lat: 51.5115, lng: -0.1235 },
      pax: 2, currency: "USD", distanceUnit: "km",
    });
    const paris = buildGetTransferPreviewQuery({
      routeId: "paris", date: "2026-11-15", time: "10:00", passengers: 3,
    }, now)!;
    expect(paris.dateTo).toBe("2026-11-15T10:00:00+01:00");
    expect(paris.query.currency).toBe("EUR");
  });

  it("rejects unknown routes, bad dates, noninteger passengers, and a less than six-hour lead", () => {
    const changes = [
      { routeId: "unapproved" },
      { passengers: 0 }, { passengers: 17 }, { passengers: 1.5 },
      { date: "2026-02-30" }, { date: "2026-11-01" }, { time: "25:01" },
    ];
    for (const change of changes) {
      expect(buildGetTransferPreviewQuery({ ...valid, ...change }, now)).toBeNull();
    }
    expect(buildGetTransferPreviewQuery({
      ...valid, date: "2026-11-06", time: "17:59",
    }, now)).toBeNull();
  });

  it("computes daylight saving offsets and rejects missing or ambiguous wall times", () => {
    expect(getUnambiguousLocalInstant("2026-07-01", "14:00", "Europe/London")?.dateTo)
      .toBe("2026-07-01T14:00:00+01:00");
    expect(getUnambiguousLocalInstant("2026-03-29", "01:30", "Europe/London")).toBeNull();
    expect(getUnambiguousLocalInstant("2026-10-25", "01:30", "Europe/London")).toBeNull();
    expect(getUnambiguousLocalInstant("2026-07-01", "14:00", "America/New_York")?.dateTo)
      .toBe("2026-07-01T14:00:00-04:00");
  });
});

describe("GetTransfer preview transport remains read only", () => {
  it("never calls sandbox without a server token or calls production", async () => {
    const fetchImpl = vi.fn();
    const query = buildGetTransferPreviewQuery({
      routeId: "new-york", date: "2026-11-15", time: "14:00", passengers: 2,
    }, new Date("2026-11-06T12:00:00Z"))!.query;
    expect(await sandboxRouteInfo(query, { token: undefined, fetchImpl: fetchImpl as unknown as typeof fetch }))
      .toEqual({ status: "missing_token" });
    expect(fetchImpl).not.toHaveBeenCalled();
    const fake = vi.fn(async () => Response.json({
      data: { success: true, prices: {
        economy: { min: "US$19", book_now: "US$48" },
        business: { min: "US$24" },
      } },
    }));
    const response = await sandboxRouteInfo(query, {
      token: "test-only-not-a-real-token", fetchImpl: fake as unknown as typeof fetch,
    });
    expect(response.status).toBe("ok");
    if (response.status !== "ok") throw new Error();
    expect(response.diagnostics.prices.find((price) => price.type === "economy")?.bookNow?.amount)
      .toEqual({ currency: "USD", minor: 4800 });
    expect(response.diagnostics.prices.find((price) => price.type === "business")?.bookable)
      .toBe(false);
    const [url, options] = fake.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).host).toBe("gtrbox.org");
    expect(new URL(url).pathname).toBe("/api/route_info");
    expect(options.method).toBe("GET");
    expect(url).not.toContain("test-only-not-a-real-token");
  });
});
