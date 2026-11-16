/**
 * Read-only GetTransfer PRODUCTION diagnostics.
 * Server only: the production token is never included in URLs, logs or responses.
 * Deliberately limited to GET /api/route_info on the fixed production host.
 */
import { buildRouteInfoUrl, parseRouteInfo, type RouteInfoDiagnostics, type RouteInfoQuery } from "./route-info";
import { classifyGetTransferTransportFailure, type GetTransferTransportFailure } from "./network-diagnostics";

export const GETTRANSFER_PRODUCTION_HOST = "gettransfer.com";
export const GETTRANSFER_PRODUCTION_TOKEN_ENV = "GETTRANSFER_PRODUCTION_TOKEN";

export interface ForbiddenDiagnostic {
  /** Based ONLY on safe, bounded HTTP headers; no response bodies are read. */
  responseKind: "json" | "html" | "other";
  cloudflare: boolean;
  cfRay: string | null;
}

function forbiddenDiagnostic(response: Response): ForbiddenDiagnostic {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const ray = response.headers.get("cf-ray");
  return {
    responseKind: contentType.includes("json") ? "json" : contentType.includes("html") ? "html" : "other",
    cloudflare: (response.headers.get("server") ?? "").toLowerCase() === "cloudflare",
    // A limited request identifier may help GetTransfer support locate a rejection.
    cfRay: ray && /^[a-zA-Z0-9-]{4,80}$/.test(ray) ? ray : null,
  };
}

export type ProductionResult =
  | { status: "ok"; httpStatus: number; diagnostics: RouteInfoDiagnostics }
  | { status: "missing_token" }
  | { status: "unauthorized"; httpStatus: 401 }
  | { status: "forbidden"; httpStatus: 403; diagnostic: ForbiddenDiagnostic }
  | { status: "rate_limited"; httpStatus: 429; retryAfterSeconds: number | null }
  | { status: "http_error"; httpStatus: number }
  | { status: "malformed_response"; httpStatus: number }
  | { status: "timeout" | "redirect_blocked" }
  | { status: GetTransferTransportFailure };

export interface ProductionOptions {
  token: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function buildProductionRouteInfoUrl(query: RouteInfoQuery): string {
  // Reuse the fully validated sandbox parameter serializer, but never fetch that URL.
  const validated = new URL(buildRouteInfoUrl(query));
  const production = new URL("https://gettransfer.com");
  production.pathname = validated.pathname;
  production.search = validated.search;
  if (production.protocol !== "https:" ||
      production.hostname !== GETTRANSFER_PRODUCTION_HOST ||
      production.pathname !== "/api/route_info") {
    throw new Error("GetTransfer production host/path restriction");
  }
  return production.toString();
}

function retryAfter(value: string | null): number | null {
  if (!value) return null;
  if (/^\d{1,6}$/.test(value.trim())) return Number(value.trim());
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : Math.max(0, Math.ceil((parsed - Date.now()) / 1000));
}

export async function productionRouteInfo(query: RouteInfoQuery, opts: ProductionOptions): Promise<ProductionResult> {
  const token = opts.token?.trim();
  if (!token) return { status: "missing_token" };
  const url = buildProductionRouteInfoUrl(query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 12_000);
  let response: Response;
  try {
    response = await (opts.fetchImpl ?? fetch)(url, {
      method: "GET",
      headers: { "X-ACCESS-TOKEN": token, Accept: "application/json" },
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (error) {
    return controller.signal.aborted || (error as { name?: string })?.name === "AbortError"
      ? { status: "timeout" }
      : { status: classifyGetTransferTransportFailure(error) };
  } finally {
    clearTimeout(timer);
  }

  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400))
    return { status: "redirect_blocked" };
  if (response.status === 401) return { status: "unauthorized", httpStatus: 401 };
  if (response.status === 403) return { status: "forbidden", httpStatus: 403, diagnostic: forbiddenDiagnostic(response) };
  if (response.status === 429)
    return { status: "rate_limited", httpStatus: 429, retryAfterSeconds: retryAfter(response.headers.get("retry-after")) };
  if (!response.ok) return { status: "http_error", httpStatus: response.status };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "malformed_response", httpStatus: response.status };
  }
  const diagnostics = parseRouteInfo(body, query.currency ?? null);
  return diagnostics
    ? { status: "ok", httpStatus: response.status, diagnostics }
    : { status: "malformed_response", httpStatus: response.status };
}
