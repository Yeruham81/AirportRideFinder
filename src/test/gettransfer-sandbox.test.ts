import { describe, expect, it, vi } from "vitest";
import { localDateTimeWithOffset } from "@/domain/time";
import { buildRouteInfoUrl, parseFormattedAmount, type RouteInfoQuery } from "@/providers/gettransfer/route-info";
import { sandboxRouteInfo } from "@/providers/gettransfer/sandbox-client.server";

const TOKEN = "test-token-not-real";
const Q: RouteInfoQuery = {
  from: { lat: 51.47, lng: -0.4543 },
  to: { lat: 51.5115, lng: -0.1235 },
  pax: 2,
  dateTo: "2026-10-23T14:00:00+01:00",
  currency: "USD",
  distanceUnit: "km",
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } }));

const SUCCESS = {
  result: "success",
  data: {
    success: true, distance: 24, duration: 45,
    prices: {
      economy: { min: "$80", min_float: 80, book_now: "$92.50" },
      business: { min: "$150", min_float: 150 },
    },
  },
};

describe("GetTransfer sandbox (mocked, never live)", () => {
  it("builds a sandbox-only GET URL with both points and local date_to", () => {
    const u = new URL(buildRouteInfoUrl(Q));
    expect(u.hostname).toBe("gtrbox.org");
    expect(u.pathname).toBe("/api/route_info");
    expect(u.searchParams.getAll("points[]")).toEqual(["51.47,-0.4543", "51.5115,-0.1235"]);
    expect(u.searchParams.get("with_prices")).toBe("true");
    expect(u.searchParams.get("date_to")).toBe("2026-10-23T14:00:00+01:00");
    expect(u.toString()).not.toContain(TOKEN);
  });

  it("formats London local time with the correct offset (BST and GMT)", () => {
    expect(localDateTimeWithOffset(new Date("2026-07-01T13:00:00Z"), "Europe/London")).toBe("2026-07-01T14:00:00+01:00");
    expect(localDateTimeWithOffset(new Date("2026-12-01T13:00:00Z"), "Europe/London")).toBe("2026-12-01T13:00:00+00:00");
  });

  it("success: book_now parsed exactly, sends token only in header, GET only", async () => {
    const f = json(200, SUCCESS);
    const r = await sandboxRouteInfo(Q, { token: TOKEN, fetchImpl: f });
    expect(r.status).toBe("ok");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["X-ACCESS-TOKEN"]).toBe(TOKEN);
    expect(url).not.toContain(TOKEN);
    if (r.status !== "ok") throw new Error();
    const eco = r.diagnostics.prices.find((p) => p.type === "economy")!;
    expect(eco.bookNow?.amount).toEqual({ currency: "USD", minor: 9250 });
    expect(eco.bookable).toBe(true);
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it("no book_now: marked non-bookable; min is not used as a quote", async () => {
    const r = await sandboxRouteInfo(Q, { token: TOKEN, fetchImpl: json(200, SUCCESS) });
    if (r.status !== "ok") throw new Error();
    const biz = r.diagnostics.prices.find((p) => p.type === "business")!;
    expect(biz.bookNow).toBeNull();
    expect(biz.bookable).toBe(false);
    expect(biz.indicativeMin).toBe("$150");
  });

  it("malformed or mismatched amounts stay unknown", () => {
    expect(parseFormattedAmount("$9x.50", "USD")?.amount).toBeNull();
    expect(parseFormattedAmount("€92", "USD")?.amount).toBeNull();
    expect(parseFormattedAmount("92", "USD")?.amount).toBeNull();
    expect(parseFormattedAmount("$92.505", "USD")?.amount).toBeNull();
    expect(parseFormattedAmount("$1,234.5", "USD")?.amount).toEqual({ currency: "USD", minor: 123450 });
  });

  it("malformed body returns malformed_response", async () => {
    const f = vi.fn(async () => new Response("<html>", { status: 200 }));
    expect((await sandboxRouteInfo(Q, { token: TOKEN, fetchImpl: f })).status).toBe("malformed_response");
  });

  it("401 and 403 are reported without body details", async () => {
    expect(await sandboxRouteInfo(Q, { token: TOKEN, fetchImpl: json(401, { error: TOKEN }) })).toEqual({ status: "unauthorized", httpStatus: 401 });
    expect(await sandboxRouteInfo(Q, { token: TOKEN, fetchImpl: json(403, { error: "x" }) })).toEqual({ status: "forbidden", httpStatus: 403 });
  });

  it("429 honours Retry-After", async () => {
    const r = await sandboxRouteInfo(Q, { token: TOKEN, fetchImpl: json(429, {}, { "retry-after": "30" }) });
    expect(r).toEqual({ status: "rate_limited", httpStatus: 429, retryAfterSeconds: 30 });
  });

  it("timeout aborts and reports timeout", async () => {
    const f = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_, rej) => {
      init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    expect((await sandboxRouteInfo(Q, { token: TOKEN, fetchImpl: f as unknown as typeof fetch, timeoutMs: 20 })).status).toBe("timeout");
  });

  it("missing token: no request is made", async () => {
    const f = vi.fn();
    expect(await sandboxRouteInfo(Q, { token: undefined, fetchImpl: f as unknown as typeof fetch })).toEqual({ status: "missing_token" });
    expect(await sandboxRouteInfo(Q, { token: "  ", fetchImpl: f as unknown as typeof fetch })).toEqual({ status: "missing_token" });
    expect(f).not.toHaveBeenCalled();
  });
});
