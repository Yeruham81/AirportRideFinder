import { describe, expect, it, vi } from "vitest";
import {
  ALPS_PARTNER_CODE, ALPS_QUOTE_MAX_AGE_MS, AlpsQuoteLimiter,
  buildAlpsPublicQuoteUrl, fetchAlpsPublicQuote, parseAlpsPublicQuote, validateAlpsPublicQuery,
} from "@/providers/alps2alps/public-quote";
import { resolveBookingLink } from "@/redirect/redirect";
import { alpsQuery as query, alpsResponse } from "./alps-public-fixtures";

const sample = () => alpsResponse(query);

describe("Alps2Alps partner quotes and supplier links", () => {
  it("sends pc, all passenger counts and the total winter bag count", () => {
    const url = new URL(buildAlpsPublicQuoteUrl(query, "winter"));
    expect(url.pathname).toBe("/api/public/v1/transfer-options");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      from: query.from, to: query.to, date: query.date, time: query.time,
      adults: "2", children: "1", infants: "1", child_seats: "1", boosters: "1",
      luggage: "0", ski_bags: "4", ski: "1", is_flight: "0", currency: "EUR", pc: ALPS_PARTNER_CODE,
    });
    for (const key of ["api_key", "api_secret", "promo", "promo_code"]) expect(url.searchParams.has(key)).toBe(false);
    const discovery = new URL(buildAlpsPublicQuoteUrl(query));
    for (const key of ["luggage", "ski_bags", "ski"]) expect(discovery.searchParams.has(key)).toBe(false);
    expect(discovery.searchParams.get("pc")).toBe(ALPS_PARTNER_CODE);
  });

  it("preserves the already-discounted price and exact supplier URL through the redirect resolver", async () => {
    const body = sample();
    body.outbound.vehicles[0]!.booking_url += "&utm_source=Airport%20Ride%20Finder";
    const result = parseAlpsPublicQuote(body, query, "winter");
    if (result.status !== "ok") throw Error(result.status);
    expect(result.offers[0]!.price).toEqual({ minor: 27249, currency: "EUR" });
    expect(result.discountPercent).toBe(5);
    expect(result.quoteUrl).toBe(body.quote_url);
    expect(result.offers[0]!.bookingUrl).toBe(body.outbound.vehicles[0]!.booking_url);
    expect(result.offers[0]!.actionable).toBe(true);
    expect(await resolveBookingLink(result.offers[0]!)).toMatchObject({
      kind: "url", url: body.outbound.vehicles[0]!.booking_url,
    });
  });

  it("uses supplier-filtered vehicles even when max_luggage is less than the winter total", () => {
    const body = sample();
    body.outbound.vehicles[0]!.max_luggage = 2;
    const result = parseAlpsPublicQuote(body, query, "winter");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.offers).toHaveLength(1);
  });

  it("shows the supplier rate without claiming a discount when the code was not applied", () => {
    const body = sample(); body.promo_code_applied = false;
    const result = parseAlpsPublicQuote(body, query, "winter");
    if (result.status !== "ok") throw Error(result.status);
    expect(result.discountPercent).toBeNull();
    expect(result.offers[0]!.price.minor).toBe(27249);
  });

  it.each([
    (url: string) => url.replace("booking.alps2alps.com", "evil.example"),
    (url: string) => url.replace("https:", "http:"),
    (url: string) => url.replace("pc=AIRPORTRIDEFINDER", "pc=OTHER"),
    (url: string) => url.replace("children=1", "children=0"),
    (url: string) => url.replace("infants=1", "infants=0"),
    (url: string) => url.replace("child_seats=1", "child_seats=0"),
    (url: string) => url.replace("ski_bags=4", "ski_bags=2"),
    (url: string) => url.replace("vehicle=10", "vehicle=11"),
    (url: string) => url + "&pc=OTHER",
    (url: string) => url + "&return_date=2031-01-17",
    (url: string) => url.replace("https://", "https://user:pass@"),
  ])("disables an unsafe, untracked or trip-mismatched returned URL", async mutate => {
    const body = sample();
    body.outbound.vehicles[0]!.booking_url = mutate(body.outbound.vehicles[0]!.booking_url);
    const result = parseAlpsPublicQuote(body, query, "winter");
    if (result.status !== "ok") throw Error(result.status);
    expect(result.offers[0]).toMatchObject({ bookingUrl: null, actionable: false });
    expect((await resolveBookingLink(result.offers[0]!)).kind).toBe("unavailable");
  });

  it("expires links after one minute and checks again when resolving a click", async () => {
    const now = Date.now();
    const result = parseAlpsPublicQuote(sample(), query, "winter", now - ALPS_QUOTE_MAX_AGE_MS);
    if (result.status !== "ok") throw Error(result.status);
    expect(await resolveBookingLink(result.offers[0]!)).toMatchObject({ kind: "unavailable" });
  });

  it("rejects invalid passengers, seating, dates and bag counts before sending any request", async () => {
    for (const patch of [
      { passengers: 0 }, { children: -1 }, { infants: 0.5 }, { passengers: 16 },
      { childSeats: 3 }, { luggage: 9 }, { skiBags: -1 }, { time: "25:00" },
      { date: "2020-01-01" }, { from: "javascript:foo" }, { to: query.from },
    ]) {
      const invalid = { ...query, ...patch };
      expect(validateAlpsPublicQuery(invalid)).toBe(false);
      const fetchImpl = vi.fn();
      expect(await fetchAlpsPublicQuote(invalid, { fetchImpl })).toEqual({ status: "invalid" });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  });

  it("verifies every passenger and requested pickup field in both responses", () => {
    for (const key of ["adults", "children", "infants", "child_seats", "boosters"] as const) {
      const body = sample(); body.passengers[key]++;
      expect(parseAlpsPublicQuote(body, query, "winter")).toEqual({ status: "quote_mismatch", field: "passengers" });
    }
    const body = sample(); body.outbound.pick_up_date_time = `${query.date} 10:00:00`;
    expect(parseAlpsPublicQuote(body, query, "winter")).toEqual({ status: "quote_mismatch", field: "pickup_time" });
  });

  it("omits invalid/off-peak offers and reports empty results accurately", () => {
    const body = sample(); body.outbound.vehicles[0]!.offer_code = "off_peak";
    expect(parseAlpsPublicQuote(body, query, "winter")).toEqual({ status: "no_offers" });
    body.outbound.vehicles[0]!.offer_code = "requested";
    body.outbound.vehicles[0]!.price = -10;
    expect(parseAlpsPublicQuote(body, query, "winter")).toEqual({ status: "no_offers" });
  });
});

describe("Alps2Alps pacing and failures", () => {
  it("limits raw quote requests to 20 per rolling minute", () => {
    let now = 1000;
    const limiter = new AlpsQuoteLimiter(() => now);
    for (let i = 0; i < 20; i++) expect(limiter.take()).toBe(true);
    expect(limiter.take()).toBe(false);
    now += 60_000;
    expect(limiter.take()).toBe(true);
  });

  it("backs off after HTTP 429 and does not retry or send another search immediately", async () => {
    let now = 1000;
    const limiter = new AlpsQuoteLimiter(() => now);
    const fetchImpl = vi.fn(async () => new Response(null, { status: 429 }));
    expect(await fetchAlpsPublicQuote(query, { fetchImpl, limiter })).toEqual({ status: "rate_limited" });
    expect(await fetchAlpsPublicQuote(query, { fetchImpl, limiter })).toEqual({ status: "rate_limited" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now += 60_000;
    await fetchAlpsPublicQuote(query, { fetchImpl, limiter });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([[404, "route_unavailable"], [422, "route_unavailable"], [500, "http_error"]])(
    "handles HTTP %s without a second price request", async (status, expected) => {
      const fetchImpl = vi.fn(async () => new Response(null, { status: Number(status) }));
      const result = await fetchAlpsPublicQuote(query, { fetchImpl, limiter: new AlpsQuoteLimiter() });
      expect(result.status).toBe(expected);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

  it("handles network failures and invalid JSON without leaking raw errors", async () => {
    const fetchImpl = vi.fn(async () => { throw Error("private detail"); });
    expect(await fetchAlpsPublicQuote(query, { fetchImpl, limiter: new AlpsQuoteLimiter() }))
      .toEqual({ status: "network_error" });
    expect(await fetchAlpsPublicQuote(query, {
      fetchImpl: vi.fn(async () => new Response("not json")), limiter: new AlpsQuoteLimiter(),
    })).toEqual({ status: "malformed_response" });
  });
});
