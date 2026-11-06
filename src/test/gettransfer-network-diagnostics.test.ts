import { describe, expect, it, vi } from "vitest";
import {
  classifyGetTransferTransportFailure,
} from "@/providers/gettransfer/network-diagnostics";
import { sandboxRouteInfo } from "@/providers/gettransfer/sandbox-client.server";
import type { RouteInfoQuery } from "@/providers/gettransfer/route-info";

const Q: RouteInfoQuery = {
  from: { lat: 51.47, lng: -0.4543 },
  to: { lat: 51.5115, lng: -0.1235 },
  pax: 2,
  dateTo: "2026-11-15T14:00:00+00:00",
  currency: "USD",
};
const SECRET = "test-token-should-not-appear-in-result";

describe("GetTransfer safe network diagnostics", () => {
  const cases = [
    ["ENOTFOUND", "dns_error"],
    ["EAI_AGAIN", "dns_error"],
    ["ERR_TLS_CERT_ALTNAME_INVALID", "tls_error"],
    ["CERT_HAS_EXPIRED", "tls_error"],
    ["UND_ERR_CONNECT_TIMEOUT", "connect_timeout"],
    ["ETIMEDOUT", "connect_timeout"],
    ["ECONNREFUSED", "connection_refused"],
    ["ECONNRESET", "connection_reset"],
    ["EHOSTUNREACH", "network_unreachable"],
    ["ENETUNREACH", "network_unreachable"],
    ["UNRECOGNIZED", "network_error"],
  ] as const;

  for (const [code, expected] of cases) {
    it(`classifies ${code} without exposing exception data`, () => {
      const error = Object.assign(new TypeError(`fetch failed with ${SECRET}`), {
        cause: Object.assign(new Error(`host, header or token: ${SECRET}`), { code }),
      });
      const label = classifyGetTransferTransportFailure(error);
      expect(label).toBe(expected);
      expect(JSON.stringify(label)).not.toContain(SECRET);
    });
  }

  it("only examines a bounded cause chain", () => {
    const error: { cause?: unknown } = {};
    error.cause = error;
    expect(classifyGetTransferTransportFailure(error)).toBe("network_error");
    expect(classifyGetTransferTransportFailure(null)).toBe("network_error");
  });

  it("returns safe DNS status from a failed GET; token stays in the header", async () => {
    const f = vi.fn(async () => {
      throw Object.assign(new TypeError("fetch failed, token " + SECRET), {
        cause: Object.assign(new Error("getaddrinfo ENOTFOUND gtrbox.org"), { code: "ENOTFOUND" }),
      });
    });
    const result = await sandboxRouteInfo(Q, { token: SECRET, fetchImpl: f as unknown as typeof fetch });
    expect(result).toEqual({ status: "dns_error" });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, options] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).hostname).toBe("gtrbox.org");
    expect(options.method).toBe("GET");
    expect(options.redirect).toBe("manual");
    expect((options.headers as Record<string, string>)["X-ACCESS-TOKEN"]).toBe(SECRET);
    expect(url).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("returns a redirect diagnostic without following or exposing Location", async () => {
    const f = vi.fn(async () => new Response(null, {
      status: 302, headers: { location: "https://untrusted.example/collect?token=" + SECRET },
    }));
    const result = await sandboxRouteInfo(Q, { token: SECRET, fetchImpl: f as unknown as typeof fetch });
    expect(result).toEqual({ status: "redirect_blocked" });
    expect(f).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("untrusted.example");
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("does not misclassify a successful HTTP response", async () => {
    const f = vi.fn(async () => Response.json({
      data: { success: true, prices: { economy: { book_now: "US$48", min: "US$19" } } },
    }));
    const result = await sandboxRouteInfo(Q, { token: SECRET, fetchImpl: f as unknown as typeof fetch });
    expect(result.status).toBe("ok");
    expect(f).toHaveBeenCalledTimes(1);
  });
});
