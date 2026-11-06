/**
 * Browser-safe, stateless read-only quote client for the Alps2Alps PUBLIC API.
 * No API key/secret, no booking endpoints, no affiliate redirects, no promo
 * applied until the supplier confirms commission attribution.
 *
 * Official: https://www.alps2alps.com/developers/public-api/
 * API explicitly documents browser CORS, GET quote-only, and no persisted row.
 */
import { moneyFromDecimal, type Money } from "@/domain/money";
import {
  ALPS_PREVIEW_ROUTE, validateAlpsQuoteQuery, type AlpsQuoteQuery,
} from "./sandbox-quote";

export const ALPS_PUBLIC_QUOTE_ENDPOINT =
  "https://booking.alps2alps.com/api/public/v1/transfer-options" as const;

export interface AlpsPublicQuoteQuery extends AlpsQuoteQuery {
  luggage: number;
}

export interface AlpsPublicOffer {
  id: string;
  vehicleLabel: string;
  maxPassengers: number | null;
  maxLuggage: number | null;
  price: Money;
  pickupTime: string;
  source: "public_live";
  actionable: false;
}

export type AlpsPublicQuoteResult =
  | { status: "invalid" | "timeout" | "network_error" | "rate_limited" | "malformed_response" | "no_offers" | "route_unavailable" }
  | { status: "http_error"; httpStatus: number }
  | { status: "ok"; offers: AlpsPublicOffer[]; pickupTime: string; luggage: number; skiBags: number };

function record(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown> : null;
}

function within(v: unknown, max = 100): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max
    ? v : null;
}
function priceInEuros(v: unknown): Money | null {
  const decimal = typeof v === "number" && Number.isFinite(v) ? String(v) : v;
  if (typeof decimal !== "string" || !/^\d{1,8}(?:\.\d{1,2})?$/.test(decimal)) return null;
  try {
    const price = moneyFromDecimal("EUR", decimal);
    return price.minor > 0 ? price : null;
  } catch { return null; }
}

export function validateAlpsPublicQuery(
  v: AlpsPublicQuoteQuery,
  now = new Date(),
): boolean {
  return validateAlpsQuoteQuery(v, now).ok && Number.isSafeInteger(v.luggage)
    && v.luggage >= 0 && v.luggage <= 8;
}

/** Fixed quote-only destination and type. No arbitrary URL or provider redirects. */
export function buildAlpsPublicQuoteUrl(query: AlpsPublicQuoteQuery): string {
  if (!validateAlpsPublicQuery(query)) throw new Error("Invalid Alps public quote request");
  const url = new URL(ALPS_PUBLIC_QUOTE_ENDPOINT);
  url.searchParams.set("from", ALPS_PREVIEW_ROUTE.from);
  url.searchParams.set("to", ALPS_PREVIEW_ROUTE.to);
  url.searchParams.set("date", query.date);
  url.searchParams.set("time", query.time);
  url.searchParams.set("adults", String(query.passengers));
  url.searchParams.set("luggage", String(query.luggage));
  url.searchParams.set("ski_bags", "0");
  url.searchParams.set("is_flight", "0"); // Literal pickup time, not flight arrival.
  url.searchParams.set("currency", "EUR");
  // No promo, source or affiliate parameters: attribution not yet approved.
  return url.toString();
}

/** Return only normalized quote fields. Drop booking_url and quote_url entirely. */
export function parseAlpsPublicQuote(
  body: unknown,
  query: AlpsPublicQuoteQuery,
): AlpsPublicQuoteResult {
  const root = record(body);
  const route = record(root?.["route"]);
  const outbound = record(root?.["outbound"]);
  const passengers = record(root?.["passengers"]);
  const extras = record(outbound?.["luggage"]);
  if (!root || !route || !outbound || !passengers ||
    root["currency"] !== "EUR" ||
    route["from_code"] !== ALPS_PREVIEW_ROUTE.from ||
    route["to_code"] !== ALPS_PREVIEW_ROUTE.to ||
    passengers["adults"] !== query.passengers ||
    !Array.isArray(outbound["vehicles"])) return { status: "malformed_response" };
  const pickup = outbound["pick_up_date_time"];
  const requestedPickup = `${query.date} ${query.time}:00`;
  // Provider must confirm the requested pickup rather than a calculated flight time.
  if (pickup !== requestedPickup) return { status: "malformed_response" };
  const providedLuggage = within(extras?.["normal_suitcases"], 100);
  const providedSkis = within(extras?.["ski_bags"], 100);
  // Display what provider actually quoted, even if it differs from our input.
  if (providedLuggage === null || providedSkis === null) {
    return { status: "malformed_response" };
  }
  const results: AlpsPublicOffer[] = [];
  for (const raw of outbound["vehicles"].slice(0, 100)) {
    const item = record(raw);
    if (!item || item["offer_code"] !== "requested") continue;
    const id = within(item["vehicle_type_id"], 100000);
    const label = item["name"];
    const price = priceInEuros(item["price"]);
    if (id === null || typeof label !== "string" || !label.trim() ||
      label.length > 100 || !price) continue;
    results.push({
      id: `public-vehicle-${id}`,
      vehicleLabel: label.trim(),
      maxPassengers: within(item["max_passengers"]),
      maxLuggage: within(item["max_luggage"]),
      price, pickupTime: String(pickup),
      source: "public_live", actionable: false,
    });
  }
  results.sort((a, b) => a.price.minor - b.price.minor || a.id.localeCompare(b.id));
  if (!results.length) return { status: "no_offers" };
  return {
    status: "ok", offers: results,
    pickupTime: String(pickup),
    luggage: providedLuggage,
    skiBags: providedSkis,
  };
}

/**
 * Safe to call client-side only from an authenticated preview after a click.
 * The documented API is unauthenticated and CORS-enabled; no credentials or
 * checkout links are involved. Never called automatically on page load.
 */
export async function fetchAlpsPublicQuote(
  query: AlpsPublicQuoteQuery,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<AlpsPublicQuoteResult> {
  if (!validateAlpsPublicQuery(query)) return { status: "invalid" };
  const controller = new AbortController();
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 12000, 100), 20000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl ?? fetch)(buildAlpsPublicQuoteUrl(query), {
      method: "GET",
      headers: { Accept: "application/json" },
      mode: "cors",
      cache: "no-store",
      redirect: "error",
      credentials: "omit",
      signal: controller.signal,
    });
    if (response.status === 429) return { status: "rate_limited" };
    if (response.status === 404 || response.status === 422) return { status: "route_unavailable" };
    if (!response.ok) return { status: "http_error", httpStatus: response.status };
    const len = Number(response.headers.get("content-length"));
    if (len > 1000000) return { status: "malformed_response" };
    const body = await response.text();
    if (body.length > 1000000) return { status: "malformed_response" };
    let json: unknown;
    try { json = JSON.parse(body) as unknown; }
    catch { return { status: "malformed_response" }; }
    return parseAlpsPublicQuote(json, query);
  } catch (error) {
    return controller.signal.aborted || (error as { name?: string })?.name === "AbortError"
      ? { status: "timeout" } : { status: "network_error" };
  } finally {
    clearTimeout(timer);
  }
}
