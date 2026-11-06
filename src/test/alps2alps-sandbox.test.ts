import { describe, expect, it, vi } from "vitest";
import {
  ALPS_AFFILIATE_CODE, ALPS_PREVIEW_ROUTE, buildAlpsQuoteBody,
  parseAlpsTransfer, parseAlpsVehicles, validateAlpsQuoteQuery,
} from "@/providers/alps2alps/sandbox-quote";
import { fetchAlpsSandboxQuote } from "@/providers/alps2alps/sandbox-client.server";

const creds = {
  ALPS2ALPS_SANDBOX_API_KEY: "test-key-not-a-real-secret",
  ALPS2ALPS_SANDBOX_API_SECRET: "test-secret-not-a-real-secret",
  ALPS2ALPS_SANDBOX_PREVIEW_ENABLED: "true",
};
const query = { date: "2030-12-05", time: "14:30", passengers: 2 };
const sample = {
  Transfer: {
    id: 1000,
    TransferSelection: {
      outbound: {
        offers: {
          "off_peak-0-2": { vehicle_type_id: 2, price: 150.5, pick_up_date_time: "2030-12-05 16:00:00" },
          "requested-4": { vehicle_type_id: 4, price: 320.99, pick_up_date_time: "2030-12-05 14:30:00" },
          "requested-2": { vehicle_type_id: 2, price: 234.5, pick_up_date_time: "2030-12-05 14:30:00" },
        },
      },
    },
  },
};
const vehicles = {
  "2": { id: "2", name: "Standard/economy", max_passengers: "3" },
  "4": { id: 4, name: "Minivan", max_passengers: 8 },
};

function fakeApi() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/token")) return Response.json({ token: "token-only-for-test-987654", expires_at: 1922000000 });
    if (url.endsWith("/vehicles")) return Response.json(vehicles);
    if (url.endsWith("/transfer")) return Response.json(sample);
    return new Response("Not found", { status: 404 });
  });
}

describe("Alps2Alps B2B sandbox pure quote models", () => {
  it("uses a fixed controlled Alpine route and explicitly one-way, requested pickup time", () => {
    expect(ALPS_AFFILIATE_CODE).toBe("AIRPORTRIDEFINDER");
    expect(ALPS_PREVIEW_ROUTE.from).toBe("airport-1");
    expect(ALPS_PREVIEW_ROUTE.to).toBe("resort-11");
    const body = buildAlpsQuoteBody(query);
    expect(body.Transfer).toEqual({
      type: "private", is_return: 0, route_from_code: "airport-1",
      route_to_code: "resort-11", outbound_date: "2030-12-05",
      outbound_time_hours: 14, outbound_time_minutes: 30,
      outbound_selected_time_is_flight: 0, adult_count: 2, children_count: 0,
    });
    expect(body.AdditionalInformation).toEqual([]);
    expect(JSON.stringify(body)).not.toContain("promo");
    expect(JSON.stringify(body)).not.toContain("booking");
  });

  it("validates genuine future times in origin timezone and passenger limits", () => {
    expect(validateAlpsQuoteQuery(query, new Date("2026-11-06T11:00:00Z")).ok).toBe(true);
    for (const input of [
      { ...query, date: "2026-02-30" },
      { ...query, date: "2026-01-01" },
      { ...query, time: "25:00" },
      { ...query, passengers: 0 },
      { ...query, passengers: 99 },
      { ...query, passengers: 2.5 },
    ]) {
      expect(validateAlpsQuoteQuery(input).ok).toBe(false);
    }
  });

  it("normalizes only explicitly requested pickup quotes and exact EUR prices", () => {
    const mapped = parseAlpsVehicles(vehicles);
    expect(mapped.get(2)).toEqual({ id: 2, name: "Standard/economy", maxPassengers: 3 });
    const parsed = parseAlpsTransfer(sample, mapped);
    expect(parsed.validShape).toBe(true);
    expect(parsed.omitted).toBe(0);
    expect(parsed.offers.map((x) => x.id)).toEqual(["requested-2", "requested-4"]);
    expect(parsed.offers.map((x) => x.price.minor)).toEqual([23450, 32099]);
    expect(parsed.offers[0]).toMatchObject({
      source: "sandbox", actionable: false,
      vehicleLabel: "Standard/economy", maxPassengers: 3,
    });
    expect(parsed.offers.every((x) => !("bookingRef" in x))).toBe(true);
  });

  it("fails closed on malformed, unknown currency, missing prices or unknown vehicle details", () => {
    const malformed = parseAlpsTransfer({ Transfer: { TransferSelection: { outbound: {} } } }, new Map());
    expect(malformed.validShape).toBe(false);
    const bad = { Transfer: { TransferSelection: { outbound: {
      offers: {
        "requested-2": { vehicle_type_id: 2, price: "USD 100" },
        "requested-3": { vehicle_type_id: 2, price: -1 },
        "requested-4": { vehicle_type_id: 10, price: "145.20" },
      },
    } } } };
    const parsed = parseAlpsTransfer(bad, new Map());
    expect(parsed.offers).toHaveLength(1);
    expect(parsed.omitted).toBe(2);
    expect(parsed.offers[0]).toMatchObject({
      vehicleLabel: "Vehicle type 10", maxPassengers: null,
      price: { currency: "EUR", minor: 14520 },
    });
  });
});

describe("Alps2Alps sandbox-only server transport", () => {
  it("never calls any API without explicit preview flag and server secrets", async () => {
    const f = fakeApi();
    expect((await fetchAlpsSandboxQuote(query, {
      env: { ...creds, ALPS2ALPS_SANDBOX_PREVIEW_ENABLED: "false" }, fetchImpl: f as unknown as typeof fetch,
    })).status).toBe("disabled");
    expect((await fetchAlpsSandboxQuote(query, {
      env: { ...creds, ALPS2ALPS_SANDBOX_API_SECRET: "" }, fetchImpl: f as unknown as typeof fetch,
    })).status).toBe("missing_secrets");
    expect(f).not.toHaveBeenCalled();
  });

  it("calls only sandbox token, vehicles and transfer, never a booking endpoint", async () => {
    const f = fakeApi();
    const r = await fetchAlpsSandboxQuote(query, {
      env: creds, fetchImpl: f as unknown as typeof fetch, timeoutMs: 500,
    });
    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error();
    expect(r.offers).toHaveLength(2);
    expect(r.vehicleCatalog).toBe("available");
    const urls = f.mock.calls.map((call) => call[0]);
    expect(urls).toEqual([
      "https://sandbox.amitours.com/api/v2/token",
      "https://sandbox.amitours.com/api/v2/vehicles",
      "https://sandbox.amitours.com/api/v2/transfer",
    ]);
    const calls = f.mock.calls as unknown as [string, RequestInit][];
    const credentials = calls[0]![1];
    expect(credentials.method).toBe("POST");
    expect(JSON.parse(credentials.body as string)).toEqual({
      api_key: creds.ALPS2ALPS_SANDBOX_API_KEY,
      api_secret: creds.ALPS2ALPS_SANDBOX_API_SECRET,
    });
    expect(calls[1]![1].method).toBe("GET");
    expect(calls[2]![1].method).toBe("POST");
    expect((calls[2]![1].headers as Record<string, string>)["Authorization"])
      .toBe("Bearer token-only-for-test-987654");
    expect(calls.every((call) => call[1].redirect === "manual")).toBe(true);
    expect(JSON.stringify(r)).not.toContain(creds.ALPS2ALPS_SANDBOX_API_SECRET);
    expect(JSON.stringify(r)).not.toContain("token-only-for-test-987654");
  });

  it("returns safe errors for auth failures, redirects and malformed token", async () => {
    for (const status of [401, 403, 429, 302]) {
      const fetchImpl = vi.fn(async () => new Response(null, { status }));
      const result = await fetchAlpsSandboxQuote(query, {
        env: creds, fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      expect(result.status).toBe(status === 429 ? "rate_limited" :
        status === 401 || status === 403 ? "unauthorized" : "http_error");
      expect(JSON.stringify(result)).not.toContain(creds.ALPS2ALPS_SANDBOX_API_SECRET);
    }
    const fetchImpl = vi.fn(async () => Response.json({ token: "x" }));
    expect((await fetchAlpsSandboxQuote(query, {
      env: creds, fetchImpl: fetchImpl as unknown as typeof fetch,
    })).status).toBe("malformed_response");
  });

  it("reports 422 no availability, without echoing unsafe upstream payloads", async () => {
    const f = vi.fn(async (url: string) =>
      url.endsWith("/token")
        ? Response.json({ token: "test-only-token-456789" })
        : url.endsWith("/transfer")
          ? Response.json({ error: "private upstream details" }, { status: 422 })
          : Response.json(vehicles));
    const result = await fetchAlpsSandboxQuote(query, {
      env: creds, fetchImpl: f as unknown as typeof fetch,
    });
    expect(result).toEqual({ status: "no_offers" });
    expect(JSON.stringify(result)).not.toContain("private upstream details");
  });

  it("does not invent vehicle metadata when catalog cannot be retrieved", async () => {
    const f = vi.fn(async (url: string) =>
      url.endsWith("/token") ? Response.json({ token: "test-only-token-456789" })
        : url.endsWith("/vehicles") ? new Response(null, { status: 503 })
          : Response.json(sample));
    const result = await fetchAlpsSandboxQuote(query, {
      env: creds, fetchImpl: f as unknown as typeof fetch,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error();
    expect(result.offers[0]?.vehicleLabel).toBe("Vehicle type 2");
    expect(result.vehicleCatalog).toBe("unavailable");
    expect(result.offers[0]?.maxPassengers).toBeNull();
  });
  it("reports the failed transport stage without leaking errors or credentials", async () => {
    const failedTokenFetch = vi.fn(async () => {
      throw new TypeError("connect ECONNREFUSED test-secret-not-a-real-secret");
    });
    const tokenFailure = await fetchAlpsSandboxQuote(query, {
      env: creds, fetchImpl: failedTokenFetch as unknown as typeof fetch,
    });
    expect(tokenFailure).toEqual({ status: "network_error", stage: "token" });
    expect(JSON.stringify(tokenFailure)).not.toContain("ECONNREFUSED");

    const transferFailureFetch = vi.fn(async (url: string) => {
      if (url.endsWith("/token")) return Response.json({ token: "test-only-token-456789" });
      if (url.endsWith("/vehicles")) return Response.json(vehicles);
      throw new TypeError("unreachable origin");
    });
    const quoteFailure = await fetchAlpsSandboxQuote(query, {
      env: creds, fetchImpl: transferFailureFetch as unknown as typeof fetch,
    });
    expect(quoteFailure).toEqual({ status: "network_error", stage: "transfer" });
    expect(JSON.stringify(quoteFailure)).not.toContain("unreachable origin");
  });

  it("labels unauthorized and malformed token failures as authentication step", async () => {
    const authReject = await fetchAlpsSandboxQuote(query, {
      env: creds,
      fetchImpl: vi.fn(async () => new Response(null, { status: 401 })) as unknown as typeof fetch,
    });
    expect(authReject).toEqual({ status: "unauthorized", stage: "token" });
    const malformed = await fetchAlpsSandboxQuote(query, {
      env: creds,
      fetchImpl: vi.fn(async () => Response.json({ token: "short" })) as unknown as typeof fetch,
    });
    expect(malformed).toEqual({ status: "malformed_response", stage: "token" });
  });

});
