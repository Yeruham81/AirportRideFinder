/**
 * Exclusive sandbox transport. A tiny allowlisted set of endpoints:
 * POST /token, GET /vehicles and POST /transfer.
 * Never uses production, follows redirects or calls a booking/payment endpoint.
 */
import {
  ALPS_SANDBOX_BASE, buildAlpsQuoteBody, parseAlpsTransfer,
  parseAlpsVehicles, type AlpsPreviewOffer, type AlpsQuoteQuery,
} from "./sandbox-quote";

export interface AlpsSandboxEnvironment {
  ALPS2ALPS_SANDBOX_API_KEY?: string | undefined;
  ALPS2ALPS_SANDBOX_API_SECRET?: string | undefined;
  ALPS2ALPS_SANDBOX_PREVIEW_ENABLED?: string | undefined;
}

export type AlpsSandboxResult =
  | { status: "disabled" | "missing_secrets" | "unauthorized" | "timeout" | "network_error" | "malformed_response" | "rate_limited" }
  | { status: "http_error"; httpStatus: number }
  | { status: "no_offers" }
  | { status: "ok"; offers: AlpsPreviewOffer[]; omitted: number };

type SandboxRequest = "token" | "vehicles" | "transfer";
const ALLOWLIST: Record<SandboxRequest, { method: "GET" | "POST"; path: string }> = {
  token: { method: "POST", path: "/token" },
  vehicles: { method: "GET", path: "/vehicles" },
  transfer: { method: "POST", path: "/transfer" },
};
const MAX_BODY = 1_000_000;

async function requestJson(
  action: SandboxRequest,
  options: { fetchImpl: typeof fetch; timeoutMs: number; bearer?: string; body?: unknown },
): Promise<
  | { status: "ok"; body: unknown }
  | { status: "unauthorized" | "rate_limited" | "timeout" | "network_error" | "malformed_response" }
  | { status: "http_error"; httpStatus: number }
> {
  const endpoint = ALLOWLIST[action];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.bearer) headers["Authorization"] = `Bearer ${options.bearer}`;
    if (endpoint.method === "POST") headers["Content-Type"] = "application/json";
    const response = await options.fetchImpl(ALPS_SANDBOX_BASE + endpoint.path, {
      method: endpoint.method,
      headers,
      ...(endpoint.method === "POST" ? { body: JSON.stringify(options.body) } : {}),
      redirect: "manual", // Cloudflare-compatible: never forward credentials.
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) return { status: "unauthorized" };
    if (response.status === 429) return { status: "rate_limited" };
    if (!response.ok) return { status: "http_error", httpStatus: response.status };
    const size = response.headers.get("content-length");
    if (size && Number(size) > MAX_BODY) return { status: "malformed_response" };
    const raw = await response.text();
    if (raw.length > MAX_BODY) return { status: "malformed_response" };
    try { return { status: "ok", body: JSON.parse(raw) as unknown }; }
    catch { return { status: "malformed_response" }; }
  } catch (error) {
    return controller.signal.aborted || (error as { name?: string })?.name === "AbortError"
      ? { status: "timeout" } : { status: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

/** User-triggered quote, never called by a page loader or the public registry. */
export async function fetchAlpsSandboxQuote(
  query: AlpsQuoteQuery,
  options: {
    env?: AlpsSandboxEnvironment;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<AlpsSandboxResult> {
  const env = options.env ?? process.env;
  if (env.ALPS2ALPS_SANDBOX_PREVIEW_ENABLED !== "true") return { status: "disabled" };
  const apiKey = env.ALPS2ALPS_SANDBOX_API_KEY?.trim();
  const apiSecret = env.ALPS2ALPS_SANDBOX_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return { status: "missing_secrets" };
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = Math.max(100, Math.min(options.timeoutMs ?? 9000, 20000));

  // Two-step auth (token valid up to 24h); deliberately no shared cached tokens.
  const token = await requestJson("token", {
    fetchImpl, timeoutMs,
    body: { api_key: apiKey, api_secret: apiSecret },
  });
  if (token.status !== "ok") return token;
  const obj = token.body && typeof token.body === "object" && !Array.isArray(token.body)
    ? token.body as Record<string, unknown> : null;
  const bearer = obj?.["token"];
  if (typeof bearer !== "string" || bearer.length < 8 || bearer.length > 4096) {
    return { status: "malformed_response" };
  }

  const [vehicleResponse, transferResponse] = await Promise.all([
    requestJson("vehicles", { fetchImpl, timeoutMs, bearer }),
    requestJson("transfer", {
      fetchImpl, timeoutMs, bearer, body: buildAlpsQuoteBody(query),
    }),
  ]);
  // The vehicle catalog is descriptive enrichment: a missing catalog does not
  // authorize guessing a vehicle class, maximum capacity, luggage or fees.
  if (transferResponse.status !== "ok") {
    if (transferResponse.status === "http_error" && transferResponse.httpStatus === 422) {
      return { status: "no_offers" };
    }
    return transferResponse;
  }
  const vehicles = vehicleResponse.status === "ok"
    ? parseAlpsVehicles(vehicleResponse.body)
    : new Map();
  const parsed = parseAlpsTransfer(transferResponse.body, vehicles);
  if (!parsed.validShape) return { status: "malformed_response" };
  if (!parsed.offers.length) return { status: "no_offers" };
  return { status: "ok", offers: parsed.offers, omitted: parsed.omitted };
}
