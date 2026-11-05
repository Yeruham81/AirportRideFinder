/**
 * Isolated server-only Intui GetAvailCar transport.
 *
 * Does not run from any route or registry. Explicitly gated behind both
 * INTUI_LIVE_ENABLED=true and a server-side INTUI_API_KEY. Never log request
 * bodies, tokens, or raw provider responses.
 *
 * Documentation: https://support.travelpayouts.com/hc/en-us/articles/360016804119-intui-travel-API
 * The documentation labels the search method GET but the concrete PHP example
 * sends JSON via POST with "apikey" in the body; this client follows that example.
 */
import { parseIntuiResponse, type IntuiParseResult } from "./response";
import type { IntuiGeoRequest } from "./request";

export const INTUI_GET_AVAIL_CAR_URL = "https://api.intui.travel/ver1_0/GetAvailCar/";

type IntuiEnvironment = {
  INTUI_API_KEY?: string | undefined;
  INTUI_LIVE_ENABLED?: string | undefined;
};

export type IntuiTransportResult =
  | { status: "disabled" | "missing_secret" | "unauthorized" | "wrong_params" | "timeout" | "network_error" | "malformed_response" }
  | { status: "rate_limited"; retryAfterSeconds: number | null }
  | { status: "http_error"; httpStatus: number }
  | { status: "no_offers" | "unverified_price_contract"; data: IntuiParseResult };

/**
 * No default config enables this function. Tests inject a fake environment and
 * mock fetch. The real key must never be passed via query parameters or props.
 */
export async function fetchIntuiGetAvailCar(
  request: IntuiGeoRequest,
  options: {
    env?: IntuiEnvironment;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<IntuiTransportResult> {
  const env = options.env ?? process.env;
  if (env.INTUI_LIVE_ENABLED !== "true") return { status: "disabled" };
  const apiKey = env.INTUI_API_KEY?.trim();
  if (!apiKey) return { status: "missing_secret" };

  // Defensive validation, even for calls that bypass the request builder.
  if (request.coordinatesType !== "geo" || !["USD", "EUR"].includes(request.currency) ||
    !Number.isSafeInteger(request.adults) || request.adults < 1 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:[0-5]\d:00$/.test(request.arrivalDateTime) ||
    Number(request.arrivalDateTime.slice(14, 16)) % 5 !== 0 ||
    [request.gpsLatR, request.gpsLatEnd].some((n) => !Number.isFinite(n) || Math.abs(n) > 90) ||
    [request.gpsLngR, request.gpsLngEnd].some((n) => !Number.isFinite(n) || Math.abs(n) > 180)
  ) return { status: "wrong_params" };

  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 10_000, 100), 30_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(INTUI_GET_AVAIL_CAR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...request, apikey: apiKey }),
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) return { status: "unauthorized" };
    if (response.status === 429) {
      const v = response.headers.get("retry-after");
      const retryAfterSeconds = v && /^\d{1,6}$/.test(v) ? Number(v) : null;
      return { status: "rate_limited", retryAfterSeconds };
    }
    if (!response.ok) return { status: "http_error", httpStatus: response.status };
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 1_000_000) return { status: "malformed_response" };
    const raw = await response.text();
    if (raw.length > 1_000_000) return { status: "malformed_response" };
    let body: unknown;
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      return { status: "malformed_response" };
    }
    const parsed = parseIntuiResponse(body, request);
    if (parsed.status === "authorization_error") return { status: "unauthorized" };
    if (parsed.status === "wrong_params") return { status: "wrong_params" };
    if (parsed.status === "malformed_response") return { status: "malformed_response" };
    // Never return raw booking links or unverified prices.
    return { status: parsed.status, data: parsed };
  } catch (error) {
    return controller.signal.aborted || (error as { name?: string })?.name === "AbortError"
      ? { status: "timeout" }
      : { status: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
