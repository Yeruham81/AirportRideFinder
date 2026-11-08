/** Read-only Transferise sandbox client. Only places and quote GETs exist here. */
import { classifyGetTransferTransportFailure, type GetTransferTransportFailure } from "@/providers/gettransfer/network-diagnostics";
import {
  TRANSFERISE_ENDPOINT, isTransferiseSandboxKey, parseTransferiseQuote,
  prepareTransferiseSearch, resolveTransferisePlace, type TransferisePreviewInput,
  type TransferisePreviewOffer,
} from "./preview";

export type TransferiseFailure = GetTransferTransportFailure | "timeout" | "redirect_blocked" |
  "unauthorized" | "forbidden" | "rate_limited" | "http_error" | "api_rejected" |
  "malformed_response" | "invalid_sandbox_key" | "invalid" | "location_unresolved";

export type TransferiseSandboxResult =
  | { kind: "ok"; offers: TransferisePreviewOffer[]; bookingUrl: string | null; routeLabel: string; retrievedAt: string }
  | { kind: "error"; code: TransferiseFailure };

class SafeFailure extends Error {
  constructor(readonly code: TransferiseFailure) { super(code); }
}

export async function searchTransferiseSandbox(input: TransferisePreviewInput, options: {
  key: string | undefined; fetchImpl?: typeof fetch; timeoutMs?: number; now?: Date;
}): Promise<TransferiseSandboxResult> {
  const key = options.key?.trim();
  if (!isTransferiseSandboxKey(key)) return { kind: "error", code: "invalid_sandbox_key" };
  const route = prepareTransferiseSearch(input, options.now);
  if (!route) return { kind: "error", code: "invalid" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(options.timeoutMs ?? 15_000, 20_000));
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(params: Record<string, string>): Promise<unknown> {
    const url = new URL(TRANSFERISE_ENDPOINT);
    url.search = new URLSearchParams(params).toString();
    const response = await fetchImpl(url.toString(), {
      method: "GET", headers: { "X-Api-Key": key!, Accept: "application/json" },
      redirect: "manual", cache: "no-store", signal: controller.signal,
    });
    if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400))
      throw new SafeFailure("redirect_blocked");
    if (response.status === 401) throw new SafeFailure("unauthorized");
    if (response.status === 403) throw new SafeFailure("forbidden");
    if (response.status === 429) throw new SafeFailure("rate_limited");
    if (!response.ok) throw new SafeFailure("http_error");
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
    if (data && typeof data === "object" && "ok" in data && data.ok === false)
      throw new SafeFailure("api_rejected");
    return data;
  }

  try {
    // Resolve the real provider IDs on each manual search. Never guess them
    // from the docs or forward names supplied by an unauthenticated browser.
    const fromData = await request({ action: "places", q: route.from.query });
    const from = resolveTransferisePlace(fromData, route.from);
    if (!from) throw new SafeFailure("location_unresolved");
    const toData = await request({ action: "places", q: route.to.query });
    const to = resolveTransferisePlace(toData, route.to);
    if (!to) throw new SafeFailure("location_unresolved");
    const body = await request({
      action: "quote", from: from.id, to: to.id, date: input.date, time: input.time,
      passengers: String(input.passengers), currency: input.currency, lang: "en",
    });
    const parsed = parseTransferiseQuote(body, input);
    if (parsed.kind !== "ok") throw new SafeFailure(parsed.kind);
    // Defend against an upstream response reflecting the key in its URL.
    if (parsed.bookingUrl?.includes(key)) throw new SafeFailure("malformed_response");
    return { ...parsed, routeLabel: `${from.label} → ${to.label}`, retrievedAt: new Date().toISOString() };
  } catch (error) {
    if (error instanceof SafeFailure) return { kind: "error", code: error.code };
    return { kind: "error", code: controller.signal.aborted ? "timeout" : classifyGetTransferTransportFailure(error) };
  } finally { clearTimeout(timer); }
}
