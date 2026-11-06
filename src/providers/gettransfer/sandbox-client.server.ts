/**
 * Server-only GetTransfer SANDBOX diagnostics client (Phase 2A).
 * - Sandbox host only (gtrbox.org), GET /route_info only. No other methods/endpoints.
 * - Token comes from the caller (read from process.env server-side); never logged or returned.
 * - Used only by the authenticated, manual private preview and the developer script.
 * - No public adapter registration, production requests, bookings or redirects.
 */
import { buildRouteInfoUrl, GETTRANSFER_SANDBOX_HOST, parseRouteInfo, type RouteInfoDiagnostics, type RouteInfoQuery } from "./route-info";
import { classifyGetTransferTransportFailure, type GetTransferTransportFailure } from "./network-diagnostics";

export const TOKEN_ENV_NAME = "GETTRANSFER_SANDBOX_TOKEN";

export type SandboxResult =
  | { status: "ok"; httpStatus: number; diagnostics: RouteInfoDiagnostics }
  | { status: "missing_token" }
  | { status: "unauthorized"; httpStatus: 401 }
  | { status: "forbidden"; httpStatus: 403 }
  | { status: "rate_limited"; httpStatus: 429; retryAfterSeconds: number | null }
  | { status: "http_error"; httpStatus: number }
  | { status: "malformed_response"; httpStatus: number }
  | { status: "timeout" | "redirect_blocked" }
  | { status: GetTransferTransportFailure };

export interface SandboxOptions {
  token: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function parseRetryAfter(v: string | null): number | null {
  if (!v) return null;
  if (/^\d{1,6}$/.test(v.trim())) return Number(v.trim());
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : Math.max(0, Math.ceil((t - Date.now()) / 1000));
}

export async function sandboxRouteInfo(query: RouteInfoQuery, opts: SandboxOptions): Promise<SandboxResult> {
  const token = opts.token?.trim();
  if (!token) return { status: "missing_token" };
  const url = buildRouteInfoUrl(query);
  if (new URL(url).hostname !== GETTRANSFER_SANDBOX_HOST) throw new Error("Sandbox host only");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(url, {
      method: "GET",
      headers: { "X-ACCESS-TOKEN": token, Accept: "application/json" },
      signal: controller.signal,
      // Do not follow redirects. Manual mode identifies a 3xx separately from
      // DNS/TLS failures, without exposing a redirect target or credential.
      redirect: "manual",
    });
  } catch (err) {
    return controller.signal.aborted || (err as { name?: string })?.name === "AbortError"
      ? { status: "timeout" }
      : { status: classifyGetTransferTransportFailure(err) };
  } finally {
    clearTimeout(timer);
  }

  if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400))
    return { status: "redirect_blocked" };
  if (res.status === 401) return { status: "unauthorized", httpStatus: 401 };
  if (res.status === 403) return { status: "forbidden", httpStatus: 403 };
  if (res.status === 429) {
    return { status: "rate_limited", httpStatus: 429, retryAfterSeconds: parseRetryAfter(res.headers.get("retry-after")) };
  }
  if (!res.ok) return { status: "http_error", httpStatus: res.status };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: "malformed_response", httpStatus: res.status };
  }
  const diagnostics = parseRouteInfo(body, query.currency ?? null);
  return diagnostics
    ? { status: "ok", httpStatus: res.status, diagnostics }
    : { status: "malformed_response", httpStatus: res.status };
}
