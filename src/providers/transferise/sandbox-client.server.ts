/** Read-only Transferise sandbox client. Only places and quote GETs exist here. */
import { classifyGetTransferTransportFailure, type GetTransferTransportFailure } from "@/providers/gettransfer/network-diagnostics";
import {
  TRANSFERISE_ENDPOINT, isTransferiseSandboxKey, parseTransferiseQuote,
  prepareTransferiseSearch, inspectTransferisePlace,
  type TransferisePreviewInput, type TransferisePreviewOffer, type TransferiseLocationDiagnostic,
} from "./preview";
import {
  cleanTransferisePlaceQuery, parseTransferisePlaces, validTransferiseSelectedSearch,
  type TransferiseSelectedSearchInput,
} from "./locations";

export type TransferiseFailure = GetTransferTransportFailure | "timeout" | "redirect_blocked" |
  "unauthorized" | "forbidden" | "rate_limited" | "http_error" | "api_rejected" |
  "malformed_response" | "invalid_sandbox_key" | "invalid" | "location_unresolved" | "selection_unavailable";

export interface TransferiseRequestDiagnostic {
  stage: "pickup_places" | "destination_places" | "quote" | "autocomplete_places";
  httpStatus: number | null;
  providerCode: string | null;
  fromId: string | null;
  toId: string | null;
}

export type TransferiseSandboxResult =
  | { kind: "ok"; offers: TransferisePreviewOffer[]; bookingUrl: string | null; routeLabel: string; retrievedAt: string }
  | { kind: "error"; code: TransferiseFailure; location?: TransferiseLocationDiagnostic; request?: TransferiseRequestDiagnostic };

class SafeFailure extends Error {
  constructor(readonly code: TransferiseFailure, readonly location?: TransferiseLocationDiagnostic) { super(code); }
}

interface SandboxOptions {
  key: string | undefined; fetchImpl?: typeof fetch; timeoutMs?: number; now?: Date;
}
type Failure = Extract<TransferiseSandboxResult, { kind: "error" }>;
type Request = (params: Record<string, string>, stage: TransferiseRequestDiagnostic["stage"]) => Promise<unknown>;

async function sandboxRequestSession<T extends { kind: "ok" }>(
  options: SandboxOptions, perform: (request: Request, key: string) => Promise<T>,
): Promise<T | Failure> {
  const key = options.key?.trim();
  if (!isTransferiseSandboxKey(key)) return { kind: "error", code: "invalid_sandbox_key" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(options.timeoutMs ?? 15_000, 20_000));
  const fetchImpl = options.fetchImpl ?? fetch;
  let requestDiagnostic: TransferiseRequestDiagnostic | undefined;

  async function boundedJson(response: Response): Promise<unknown> {
    // Bounded response, including runtimes where Content-Length is not present.
    if (Number(response.headers.get("Content-Length")) > 512_000 || !response.body)
      throw new SafeFailure("malformed_response");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 512_000) { await reader.cancel(); throw new SafeFailure("malformed_response"); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let data: unknown;
    try { data = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new SafeFailure("malformed_response"); }
    return data;
  }

  function providerErrorCode(data: unknown): string | null {
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    const record = data as Record<string, unknown>;
    const error = record["error"];
    const nested = error && typeof error === "object" ? error as Record<string, unknown> : null;
    const code = nested?.["code"] ?? error ?? record["code"];
    // Accept only a short machine code. No free-text message, key or raw body.
    return typeof code === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(code) &&
      !code.startsWith("tfx_") && !code.includes(key!) ? code : null;
  }

  async function request(params: Record<string, string>, stage: TransferiseRequestDiagnostic["stage"]): Promise<unknown> {
    requestDiagnostic = {
      stage, httpStatus: null, providerCode: null,
      fromId: stage === "quote" ? params["from"] ?? null : null,
      toId: stage === "quote" ? params["to"] ?? null : null,
    };
    const url = new URL(TRANSFERISE_ENDPOINT);
    url.search = new URLSearchParams(params).toString();
    const response = await fetchImpl(url.toString(), {
      method: "GET", headers: { "X-Api-Key": key!, Accept: "application/json" },
      redirect: "manual", cache: "no-store", signal: controller.signal,
    });
    requestDiagnostic.httpStatus = response.status;
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400))
      throw new SafeFailure("redirect_blocked");
    if (!response.ok) {
      // Malformed/HTML error bodies must never hide the actual HTTP status.
      try { requestDiagnostic.providerCode = providerErrorCode(await boundedJson(response)); } catch { /* status is enough */ }
      if (response.status === 401) throw new SafeFailure("unauthorized");
      if (response.status === 403) throw new SafeFailure("forbidden");
      if (response.status === 429) throw new SafeFailure("rate_limited");
      throw new SafeFailure("http_error");
    }
    const data = await boundedJson(response);
    if (data && typeof data === "object" && "ok" in data && data.ok === false) {
      requestDiagnostic.providerCode = providerErrorCode(data);
      throw new SafeFailure("api_rejected");
    }
    return data;
  }

  try {
    return await perform(request, key);
  } catch (error) {
    const requestInfo = requestDiagnostic ? { request: requestDiagnostic } : {};
    if (error instanceof SafeFailure) return {
      kind: "error", code: error.code, ...requestInfo,
      ...(error.location ? { location: error.location } : {}),
    };
    return { kind: "error", code: controller.signal.aborted ? "timeout" : classifyGetTransferTransportFailure(error), ...requestInfo };
  } finally { clearTimeout(timer); }
}




/** Retained for bounded preset diagnostics/tests; the UI now uses explicit selections. */
export async function searchTransferiseSandbox(input: TransferisePreviewInput, options: SandboxOptions): Promise<TransferiseSandboxResult> {
  const route = prepareTransferiseSearch(input, options.now);
  if (!route) return { kind: "error", code: "invalid" };
  return sandboxRequestSession(options, async (request, key) => {
    // Use only IDs returned by the actual places responses for this account.
    // Documentation/example IDs must never replace a failed place lookup.
    const fromData = await request({ action: "places", q: route.from.query }, "pickup_places");
    const fromCheck = inspectTransferisePlace(fromData, route.from, key);
    const from = fromCheck.place;
    const diagnostic = (check: typeof fromCheck, stage: "pickup" | "destination", query: string): TransferiseLocationDiagnostic => ({
      stage, query, reason: check.reason, returnedCount: check.returnedCount,
      matchingCount: check.matchingCount, candidates: check.candidates,
    });
    if (!from) throw new SafeFailure("location_unresolved", diagnostic(fromCheck, "pickup", route.from.query));
    const toData = await request({ action: "places", q: route.to.query }, "destination_places");
    const toCheck = inspectTransferisePlace(toData, route.to, key);
    const destinationDiagnostic = diagnostic(toCheck, "destination", route.to.query);
    const to = toCheck.place;
    if (!to) throw new SafeFailure("location_unresolved", destinationDiagnostic);
    const body = await request({
      action: "quote", from: from.id, to: to.id, date: input.date, time: input.time,
      passengers: String(input.passengers), currency: input.currency, lang: "en",
    }, "quote");
    const parsed = parseTransferiseQuote(body, input);
    if (parsed.kind !== "ok") throw new SafeFailure(parsed.kind);
    // Defend against an upstream response reflecting the key in its URL.
    if (parsed.bookingUrl?.includes(key)) throw new SafeFailure("malformed_response");
    return { ...parsed, routeLabel: `${from.label} → ${to.label}`, retrievedAt: new Date().toISOString() };
  });
}

/** Suggestions contain only validated records actually returned by places. */
export async function searchTransferisePlacesSandbox(query: string, options: SandboxOptions) {
  const q = cleanTransferisePlaceQuery(query);
  if (!q) return { kind: "error" as const, code: "invalid" as const };
  return sandboxRequestSession(options, async (request, key) => {
    const data = await request({ action: "places", q }, "autocomplete_places");
    const parsed = parseTransferisePlaces(data, q, key);
    if (parsed.kind !== "ok") throw new SafeFailure("malformed_response");
    return parsed;
  });
}

/** Revalidate selected IDs against fresh provider records before every quote. */
export async function searchTransferiseSelectedSandbox(input: TransferiseSelectedSearchInput, options: SandboxOptions): Promise<TransferiseSandboxResult> {
  if (!validTransferiseSelectedSearch(input, options.now)) return { kind: "error", code: "invalid" };
  return sandboxRequestSession(options, async (request, key) => {
    async function selectedPlace(ref: { id: string; query: string }, stage: "pickup_places" | "destination_places") {
      const data = await request({ action: "places", q: ref.query.trim() }, stage);
      const parsed = parseTransferisePlaces(data, ref.query.trim(), key);
      if (parsed.kind !== "ok") throw new SafeFailure("malformed_response");
      const place = parsed.places.find((item) => item.id === ref.id);
      if (!place) throw new SafeFailure("selection_unavailable");
      return place;
    }
    const from = await selectedPlace(input.from, "pickup_places");
    const to = await selectedPlace(input.to, "destination_places");
    if (from.timeZone && from.timeZone !== input.pickupTimeZone) throw new SafeFailure("invalid");
    const body = await request({
      action: "quote", from: from.id, to: to.id, date: input.date, time: input.time,
      passengers: String(input.passengers), currency: input.currency, lang: "en",
    }, "quote");
    const parsed = parseTransferiseQuote(body, input);
    if (parsed.kind !== "ok") throw new SafeFailure(parsed.kind);
    if (parsed.bookingUrl?.includes(key)) throw new SafeFailure("malformed_response");
    return { ...parsed, routeLabel: `${from.label} → ${to.label}`, retrievedAt: new Date().toISOString() };
  });
}

