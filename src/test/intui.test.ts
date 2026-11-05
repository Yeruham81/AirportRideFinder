import { describe, expect, it, vi } from "vitest";
import { LOCATIONS } from "@/data/locations";
import type { TransferSearchRequest } from "@/domain/types";
import { getAdapters } from "@/providers/registry";
import { createIntuiAdapter } from "@/providers/intui/adapter.server";
import { fetchIntuiGetAvailCar, INTUI_GET_AVAIL_CAR_URL } from "@/providers/intui/client.server";
import { buildIntuiGeoRequest } from "@/providers/intui/request";
import { parseIntuiResponse } from "@/providers/intui/response";

const pickup = LOCATIONS.find((l) => l.id === "lhr")!;
const dropoff = LOCATIONS.find((l) => l.id === "central-london")!;
const transfer: TransferSearchRequest = {
  pickupId: "lhr",
  dropoffId: "central-london",
  localDate: "2026-12-15",
  localTime: "10:05",
  timeZone: "Europe/London",
  passengers: 2,
  luggage: 2,
  preferredCurrency: null,
};
const query = buildIntuiGeoRequest(transfer, pickup, dropoff);
const liveEnv = { INTUI_API_KEY: "test-placeholder-only", INTUI_LIVE_ENABLED: "true" };
const mockJson = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));

describe("Intui GEO request (pure, never makes network calls)", () => {
  it("builds documented one-way coordinate request for London in USD", () => {
    expect(query).toEqual({
      coordinatesType: "GEO",
      gpsLatR: pickup.coords!.lat, gpsLngR: pickup.coords!.lng,
      gpsLatEnd: dropoff.coords!.lat, gpsLngEnd: dropoff.coords!.lng,
      adults: 2, arrivalDateTime: "2026-12-15T10:05:00",
      currency: "USD", lang: "en", multiprice: false,
    });
    expect(JSON.stringify(query)).not.toMatch(/apikey|api_key|token|secret/i);
  });
  it("rejects invalid pickup times, locations, and unsupported currencies", () => {
    expect(() => buildIntuiGeoRequest({ ...transfer, localTime: "10:07" }, pickup, dropoff)).toThrow("invalid_pickup_datetime");
    expect(() => buildIntuiGeoRequest({ ...transfer, timeZone: "UTC" }, pickup, dropoff)).toThrow("pickup_zone_mismatch");
    expect(() => buildIntuiGeoRequest(transfer, pickup, pickup)).toThrow("invalid_locations");
    expect(() => buildIntuiGeoRequest({ ...transfer, preferredCurrency: "JPY" }, pickup, dropoff)).toThrow("unsupported_currency");
  });
});

describe("Intui response parser (fail closed until price contract verified)", () => {
  it("identifies empty successful responses without inventing prices", () => {
    expect(parseIntuiResponse({ status: "ok", LocationInfo: { travelling: [] } }, query)).toEqual({
      status: "no_offers", offers: [], diagnostics: [],
    });
  });
  it("does not expose unverified prices or booking links", () => {
    const parsed = parseIntuiResponse({
      status: "ok",
      LocationInfo: { travelling: [{
        info: { productid: 1234, vehicle_type: "private", type_vehicle: "Sedan",
          vehicle_class: "Standard", maxpax: 4, luggage: 2, free_cancellation: 24,
          intuiUrlOrderSingle: "https://www.intui.travel/secret-booking" },
        additional: { meet_greet: 1 },
        pricing: { allprice: { unknown: "99" } },
      }] },
    }, query);
    expect(parsed.status).toBe("unverified_price_contract");
    if (parsed.status !== "unverified_price_contract") throw new Error("expected fail closed");
    expect(parsed.offers).toHaveLength(0);
    expect(parsed.omittedCount).toBe(1);
    expect(parsed.diagnostics).toHaveLength(1);
    expect(parsed.diagnostics[0]).toMatchObject({
      maxPassengers: 4, maxLuggage: 2, cancellation: { kind: "free_until", hoursBefore: 24 },
      meetAndGreet: true, priceStatus: "unverified_shape", trackingEnabled: false,
    });
    expect(JSON.stringify(parsed)).not.toContain("secret-booking");
  });
  it("rejects unknown and authorization-error payloads", () => {
    expect(parseIntuiResponse({ status: "authorization_error" }, query).status).toBe("authorization_error");
    expect(parseIntuiResponse({ status: "wrong_params" }, query).status).toBe("wrong_params");
    expect(parseIntuiResponse({ status: "ok" }, query).status).toBe("malformed_response");
  });
});

describe("Intui server transport (all calls mocked)", () => {
  it("never contacts provider when disabled or missing the secret", async () => {
    const fetchImpl = vi.fn();
    expect(await fetchIntuiGetAvailCar(query, { env: { INTUI_LIVE_ENABLED: "false", INTUI_API_KEY: "x" }, fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ status: "disabled" });
    expect(await fetchIntuiGetAvailCar(query, { env: { INTUI_LIVE_ENABLED: "true" }, fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ status: "missing_secret" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("uses POST JSON over HTTPS with key only in body, never in URL", async () => {
    const f = mockJson(200, { status: "ok", LocationInfo: { travelling: [] } });
    const result = await fetchIntuiGetAvailCar(query, { env: liveEnv, fetchImpl: f });
    expect(result.status).toBe("no_offers");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(INTUI_GET_AVAIL_CAR_URL);
    expect(url.startsWith("https://")).toBe(true);
    expect(url).not.toContain(liveEnv.INTUI_API_KEY);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body as string)).toMatchObject({ ...query, apikey: liveEnv.INTUI_API_KEY });
    expect(JSON.stringify(result)).not.toContain(liveEnv.INTUI_API_KEY);
  });
  it("handles HTTP and provider authorization failures and rate limits", async () => {
    expect((await fetchIntuiGetAvailCar(query, { env: liveEnv, fetchImpl: mockJson(403, {}) })).status).toBe("unauthorized");
    expect((await fetchIntuiGetAvailCar(query, { env: liveEnv, fetchImpl: mockJson(200, { status: "authorization_error" }) })).status).toBe("unauthorized");
    expect(await fetchIntuiGetAvailCar(query, { env: liveEnv, fetchImpl: mockJson(429, {}, { "retry-after": "30" }) })).toEqual({
      status: "rate_limited", retryAfterSeconds: 30,
    });
  });
  it("returns sanitized errors for malformed bodies and network failures", async () => {
    const badJson = vi.fn(async () => new Response("not JSON", { status: 200 }));
    expect((await fetchIntuiGetAvailCar(query, { env: liveEnv, fetchImpl: badJson })).status).toBe("malformed_response");
    const broken = vi.fn(async () => { throw new Error("private networking details"); });
    expect(await fetchIntuiGetAvailCar(query, { env: liveEnv, fetchImpl: broken })).toEqual({ status: "network_error" });
  });
  it("does not register Intui in the four-provider demonstration", async () => {
    expect(getAdapters()).toHaveLength(4);
    expect(getAdapters().some((a) => a.provider.id === "intui")).toBe(false);
    const a = createIntuiAdapter(LOCATIONS);
    const r = await a.search(transfer, { searchRef: "test" });
    expect(r.status).toBe("error");
    expect(r.offers).toEqual([]);
  });
});
