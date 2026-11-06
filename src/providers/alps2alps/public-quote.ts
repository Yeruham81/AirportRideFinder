/**
 * Read-only Alps2Alps Public API. Client-side, no credentials and no
 * bookings, redirects, affiliate markers, or checkout actions.
 * All browser calls are opt-in and use the two published GET endpoints.
 */
import { moneyFromDecimal, type Money } from "@/domain/money";
import { isValidDateString, isValidTimeString, isPastPickup } from "@/domain/time";

const PUBLIC_BASE = "https://booking.alps2alps.com/api/public/v1";
export const ALPS_PUBLIC_QUOTE_ENDPOINT = `${PUBLIC_BASE}/transfer-options` as const;
export const ALPS_PUBLIC_LOCATIONS_ENDPOINT = `${PUBLIC_BASE}/locations/search` as const;
/** Official read-only partner resource from the Alps2Alps onboarding email. */
export const ALPS_PUBLIC_ROUTE_CATALOG_ENDPOINT = "https://booking.alps2alps.com/api/resource/routes" as const;

export const ALPS_INITIAL_FROM = {
  code: "airport-1", name: "Geneva Airport", type: "airport", country: "Switzerland",
} as const;
export const ALPS_INITIAL_TO = {
  code: "resort-11", name: "Chamonix", type: "resort", country: "France",
} as const;

/**
 * Observed supplier-season heuristic, NOT a published contractual cutoff.
 * Verified for 2026-11-13, 2026-12-01, 2027-04-30 and 2027-05-01.
 * We still validate provider-echoed baggage and explicitly warn if it differs.
 */
export function alpsSeasonalBagMode(date: string): "winter" | "summer" | null {
  if (!isValidDateString(date)) return null;
  const month = Number(date.slice(5, 7));
  return month === 12 || month <= 4 ? "winter" : "summer";
}

export type AlpsPublicCurrency = "EUR" | "GBP" | "USD";
export interface AlpsPublicLocation {
  code: string;
  name: string;
  type: "airport" | "resort" | "city" | "train_station";
  country: string;
}
export interface AlpsPublicQuoteQuery {
  from: string;
  to: string;
  date: string;
  time: string;
  passengers: number;
  luggage: number;
  skiBags: number;
  currency: AlpsPublicCurrency;
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
  | { status: "quote_mismatch"; field: AlpsQuoteMismatchField; requested?: number; quoted?: number }
  | {
      status: "ok";
      offers: AlpsPublicOffer[];
      pickupTime: string;
      luggage: number;
      skiBags: number;
      /** Supplier actually quoted zero ski bags; no requested bags are included. */
      bagAdjustment?: {
        requestedSkiBags: number;
        quotedSkiBags: 0;
      };
      /** Supplier did not quote the requested standard suitcases (often winter mode). */
      suitcaseAdjustment?: {
        requestedSuitcases: number;
        quotedSuitcases: 0;
      };
      route: { from: string; to: string };
      /** Diagnostics only. Never expose or launch vendor-provided checkout URLs. */
      linkEvidence: { quoteUrlPresent: boolean; vehicleUrlsPresent: number };
    };

export type AlpsLocationSearchResult =
  | { status: "invalid" | "timeout" | "network_error" | "rate_limited" | "malformed_response" | "route_unavailable" }
  | { status: "http_error"; httpStatus: number }
  | { status: "ok"; locations: AlpsPublicLocation[] };

export interface AlpsRouteCatalog {
  /** Active supplier route endpoints only (airports / stations / cities and resorts). */
  locations: AlpsPublicLocation[];
  /** Bidirectional station–resort pairs from active vendor routes. */
  pairs: ReadonlySet<string>;
  activeRouteCount: number;
}
export type AlpsRouteCatalogResult =
  | { status: "ok"; catalog: AlpsRouteCatalog }
  | { status: "timeout" | "network_error" | "rate_limited" | "malformed_response" | "route_unavailable" }
  | { status: "http_error"; httpStatus: number };

export type AlpsQuoteMismatchField =
  | "route" | "currency" | "passengers" | "pickup_time" |
    "suitcases" | "ski_bags";


const CODE = /^(?:airport|resort|city|train_station)-[1-9]\d{0,7}(?:-[a-z])?$/;
const MAX_BODY = 1_000_000;

export function validAlpsLocationCode(code: string): boolean {
  return CODE.test(code);
}
function record(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown> : null;
}
function within(v: unknown, max = 100): number | null {
  return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max ? v : null;
}
function safeLabel(v: unknown, max = 120): string | null {
  if (typeof v !== "string" || v.trim().length === 0 || v.length > max ||
    /[\x00-\x1F\x7F]/.test(v)) return null;
  return v.trim();
}
function money(v: unknown, currency: AlpsPublicCurrency): Money | null {
  const decimal = typeof v === "number" && Number.isFinite(v) ? String(v) : v;
  if (typeof decimal !== "string" || !/^\d{1,8}(?:\.\d{1,2})?$/.test(decimal)) return null;
  try {
    const amount = moneyFromDecimal(currency, decimal);
    return amount.minor > 0 ? amount : null;
  } catch { return null; }
}
function knownCurrency(value: string): value is AlpsPublicCurrency {
  return value === "EUR" || value === "GBP" || value === "USD";
}

export function validateAlpsPublicQuery(
  query: AlpsPublicQuoteQuery,
  now = new Date(),
): boolean {
  return validAlpsLocationCode(query.from) && validAlpsLocationCode(query.to) &&
    query.from !== query.to &&
    isValidDateString(query.date) && isValidTimeString(query.time) &&
    // Supported Alpine destinations use Central European local pickup time.
    isPastPickup(query.date, query.time, "Europe/Zurich", now) === false &&
    Number.isSafeInteger(query.passengers) && query.passengers >= 1 && query.passengers <= 16 &&
    Number.isSafeInteger(query.luggage) && query.luggage >= 0 && query.luggage <= 8 &&
    Number.isSafeInteger(query.skiBags) && query.skiBags >= 0 && query.skiBags <= 8 &&
    knownCurrency(query.currency);
}

export function buildAlpsPublicQuoteUrl(query: AlpsPublicQuoteQuery): string {
  if (!validateAlpsPublicQuery(query)) throw new Error("Invalid Alps public quote request");
  const url = new URL(ALPS_PUBLIC_QUOTE_ENDPOINT);
  url.searchParams.set("from", query.from);
  url.searchParams.set("to", query.to);
  url.searchParams.set("date", query.date);
  url.searchParams.set("time", query.time);
  url.searchParams.set("adults", String(query.passengers));
  url.searchParams.set("luggage", String(query.luggage));
  url.searchParams.set("ski_bags", String(query.skiBags));
  url.searchParams.set("ski", query.skiBags > 0 ? "1" : "0");
  url.searchParams.set("is_flight", "0"); // Treat time as the pickup time, not flight arrival.
  url.searchParams.set("currency", query.currency);
  // Attribution / discount semantics are unconfirmed. No pc, promo, source or deep links.
  return url.toString();
}

export function parseAlpsLocations(body: unknown): AlpsPublicLocation[] | null {
  if (!Array.isArray(body) || body.length > 500) return null;
  const found: AlpsPublicLocation[] = [];
  const seen = new Set<string>();
  for (const raw of body) {
    const item = record(raw);
    const code = item?.["code"];
    const name = safeLabel(item?.["name"]);
    const country = safeLabel(item?.["country"], 80);
    const type = item?.["type"];
    if (typeof code !== "string" || !validAlpsLocationCode(code) ||
      !name || !country || !["airport", "resort", "city", "train_station"].includes(String(type)) ||
      seen.has(code)) continue;
    if (!code.startsWith(`${type}-`)) continue;
    seen.add(code);
    found.push({ code, name, type: type as AlpsPublicLocation["type"], country });
  }
  // Displayed options may be limited, but only vendor-returned codes are selectable.
  return found.slice(0, 35);
}

/** The list is read from live supplier resource data, not a hand-maintained city list. */
export function parseAlpsRouteCatalog(body: unknown): AlpsRouteCatalog | null {
  if (!Array.isArray(body) || !body.length || body.length > 10000) return null;
  const places = new Map<string, AlpsPublicLocation>();
  const pairs = new Set<string>();
  const typeFromCode = (code: string): AlpsPublicLocation["type"] =>
    code.slice(0, code.indexOf("-")) as AlpsPublicLocation["type"];
  for (const raw of body) {
    const row = record(raw);
    if (!row || (row["is_active"] !== 1 && row["is_active"] !== true)) continue;
    const station = row["station"];
    const resort = row["resort"];
    const stationName = safeLabel(row["station_name"]);
    const resortName = safeLabel(row["resort_name"]);
    if (typeof station !== "string" || !validAlpsLocationCode(station) ||
      !/^(airport|train_station|city)-/.test(station) ||
      typeof resort !== "string" || !/^resort-[1-9]\d{0,7}$/.test(resort) ||
      !stationName || !resortName) continue;
    places.set(station, {
      code: station, name: stationName, type: typeFromCode(station),
      country: "",
    });
    places.set(resort, {
      code: resort, name: resortName, type: "resort", country: "",
    });
    pairs.add([station, resort].sort().join("|"));
  }
  if (!pairs.size || !places.size) return null;
  return {
    locations: [...places.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "en") || a.code.localeCompare(b.code)),
    pairs,
    activeRouteCount: pairs.size,
  };
}

export function alpsCatalogAllowsPair(
  catalog: AlpsRouteCatalog, a: string, b: string,
): boolean {
  return catalog.pairs.has([a, b].sort().join("|"));
}

/** Fuzzy substring suggestions, ranked prefix-first; never fabricate identifiers. */
export function suggestAlpsCatalogLocations(
  catalog: AlpsRouteCatalog,
  term: string,
  connectedTo?: string | null,
  maxResults = 16,
): AlpsPublicLocation[] {
  const q = term.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!q || q.length > 80) return [];
  return catalog.locations
    .filter(location =>
      (!connectedTo || alpsCatalogAllowsPair(catalog, connectedTo, location.code)) &&
      location.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes(q))
    .sort((a, b) => {
      const aStart = a.name.toLowerCase().startsWith(q) ? 0 : 1;
      const bStart = b.name.toLowerCase().startsWith(q) ? 0 : 1;
      return aStart - bStart ||
        (a.type === "airport" ? 0 : 1) - (b.type === "airport" ? 0 : 1) ||
        a.name.localeCompare(b.name, "en");
    })
    .slice(0, Math.max(1, Math.min(maxResults, 50)));
}

export function buildAlpsLocationSearchUrl(term: string): string {
  const q = term.trim();
  if (q.length < 2 || q.length > 80 || /[\x00-\x1F\x7F]/.test(q)) {
    throw new Error("Location search requires 2–80 printable characters");
  }
  const url = new URL(ALPS_PUBLIC_LOCATIONS_ENDPOINT);
  url.searchParams.set("q", q);
  return url.toString();
}

function safeVendorUrl(
  input: unknown, path: "quote" | "vehicle",
  query: AlpsPublicQuoteQuery, vehicleId?: number,
): boolean {
  if (typeof input !== "string" || input.length > 4096) return false;
  try {
    const url = new URL(input);
    if (url.origin !== "https://booking.alps2alps.com" ||
      (path === "quote" && !["/book/quick-search", "/booking/quick-search"].includes(url.pathname)) ||
      (path === "vehicle" && !["/book/quick-checkout", "/booking/quick-checkout"].includes(url.pathname)))
      return false;
    if (url.searchParams.get("from") !== query.from ||
      url.searchParams.get("to") !== query.to ||
      url.searchParams.get("date") !== query.date ||
      url.searchParams.get("time") !== query.time) return false;
    if (path === "vehicle" && url.searchParams.get("vehicle") !== String(vehicleId)) return false;
    return true;
  } catch { return false; }
}

/** Strict response normalization, discard booking_url and quote_url values. */
export function parseAlpsPublicQuote(
  body: unknown, query: AlpsPublicQuoteQuery,
): AlpsPublicQuoteResult {
  const root = record(body);
  const route = record(root?.["route"]);
  const outbound = record(root?.["outbound"]);
  const passengers = record(root?.["passengers"]);
  const extras = record(outbound?.["luggage"]);
  const fromName = safeLabel(route?.["from"]);
  const toName = safeLabel(route?.["to"]);
  if (!root || !route || !outbound || !passengers || !fromName || !toName ||
    !Array.isArray(outbound["vehicles"])) return { status: "malformed_response" };
  if (root["currency"] !== query.currency) return { status: "quote_mismatch", field: "currency" };
  if (route["from_code"] !== query.from || route["to_code"] !== query.to)
    return { status: "quote_mismatch", field: "route" };
  if (passengers["adults"] !== query.passengers)
    return { status: "quote_mismatch", field: "passengers" };
  const pickup = outbound["pick_up_date_time"];
  if (pickup !== `${query.date} ${query.time}:00`)
    return { status: "quote_mismatch", field: "pickup_time" };
  const luggage = within(extras?.["normal_suitcases"]);
  const skiBags = within(extras?.["ski_bags"]);
  // Summer ski bags are silently ignored by the provider. We never label this
  // as a valid quote for a different baggage configuration.
  if (luggage === null || skiBags === null) return { status: "malformed_response" };
  // Symmetric safeguard: winter can ignore suitcases entirely. Show only
  // the quote for zero suitcases with a prominent exclusion warning.
  const adjustedSuitcases = query.luggage > 0 && luggage === 0
    ? { requestedSuitcases: query.luggage, quotedSuitcases: 0 as const }
    : undefined;
  if (luggage !== query.luggage && !adjustedSuitcases)
    return { status: "quote_mismatch", field: "suitcases", requested: query.luggage, quoted: luggage };
  // Some supplier searches (confirmed in summer) ignore requested ski bags
  // and quote zero. We may show the ALREADY RETURNED zero-bag quote without a
  // second API request, but only with explicit disclosure and adjusted form
  // state. Never imply that the original bags are included in that price.
  const adjustedSkiBags = query.skiBags > 0 && skiBags === 0
    ? { requestedSkiBags: query.skiBags, quotedSkiBags: 0 as const }
    : undefined;
  if (skiBags !== query.skiBags && !adjustedSkiBags)
    return { status: "quote_mismatch", field: "ski_bags", requested: query.skiBags, quoted: skiBags };

  const offers: AlpsPublicOffer[] = [];
  let vehicleUrlsPresent = 0;
  const seen = new Set<number>();
  for (const raw of outbound["vehicles"].slice(0, 100)) {
    const item = record(raw);
    if (!item || item["offer_code"] !== "requested") continue;
    const vehicleId = within(item["vehicle_type_id"], 100000);
    const label = safeLabel(item["name"]);
    const price = money(item["price"], query.currency);
    if (vehicleId === null || vehicleId === 0 || !label || !price || seen.has(vehicleId)) continue;
    const maxPassengers = within(item["max_passengers"]);
    const maxLuggage = within(item["max_luggage"]);
    if ((maxPassengers !== null && maxPassengers < query.passengers) ||
      (maxLuggage !== null && maxLuggage < query.luggage)) continue;
    seen.add(vehicleId);
    if (safeVendorUrl(item["booking_url"], "vehicle", query, vehicleId)) vehicleUrlsPresent++;
    offers.push({
      id: `public-vehicle-${vehicleId}`,
      vehicleLabel: label,
      maxPassengers,
      maxLuggage,
      price,
      pickupTime: String(pickup),
      source: "public_live",
      actionable: false,
    });
  }
  offers.sort((a, b) => a.price.minor - b.price.minor || a.id.localeCompare(b.id));
  if (!offers.length) return { status: "no_offers" };
  return {
    status: "ok",
    offers,
    pickupTime: String(pickup),
    luggage,
    skiBags,
    ...(adjustedSkiBags ? { bagAdjustment: adjustedSkiBags } : {}),
    ...(adjustedSuitcases ? { suitcaseAdjustment: adjustedSuitcases } : {}),
    route: { from: fromName, to: toName },
    linkEvidence: {
      quoteUrlPresent: safeVendorUrl(root["quote_url"], "quote", query),
      vehicleUrlsPresent,
    },
  };
}

async function publicJson(url: string, fetchImpl: typeof fetch, timeoutMs: number):
  Promise<{ status: "ok"; body: unknown } |
    { status: "timeout" | "network_error" | "rate_limited" | "malformed_response" | "route_unavailable" } |
    { status: "http_error"; httpStatus: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Math.max(timeoutMs, 100), 20000));
  try {
    const response = await fetchImpl(url, {
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
    if (len > MAX_BODY) return { status: "malformed_response" };
    const raw = await response.text();
    if (raw.length > MAX_BODY) return { status: "malformed_response" };
    try { return { status: "ok", body: JSON.parse(raw) as unknown }; }
    catch { return { status: "malformed_response" }; }
  } catch (error) {
    return controller.signal.aborted || (error as { name?: string })?.name === "AbortError"
      ? { status: "timeout" } : { status: "network_error" };
  } finally { clearTimeout(timer); }
}

export async function fetchAlpsLocations(
  term: string, options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<AlpsLocationSearchResult> {
  let url: string;
  try { url = buildAlpsLocationSearchUrl(term); }
  catch { return { status: "invalid" }; }
  const response = await publicJson(url, options.fetchImpl ?? fetch, options.timeoutMs ?? 10000);
  if (response.status !== "ok") return response;
  const locations = parseAlpsLocations(response.body);
  return locations ? { status: "ok", locations } : { status: "malformed_response" };
}

export async function fetchAlpsPublicQuote(
  query: AlpsPublicQuoteQuery,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<AlpsPublicQuoteResult> {
  if (!validateAlpsPublicQuery(query)) return { status: "invalid" };
  const response = await publicJson(
    buildAlpsPublicQuoteUrl(query), options.fetchImpl ?? fetch, options.timeoutMs ?? 12000,
  );
  return response.status === "ok" ? parseAlpsPublicQuote(response.body, query) : response;
}

/** One catalog GET per private page mount; no typed-query network calls needed. */
export async function fetchAlpsRouteCatalog(
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<AlpsRouteCatalogResult> {
  const response = await publicJson(
    ALPS_PUBLIC_ROUTE_CATALOG_ENDPOINT,
    options.fetchImpl ?? fetch,
    options.timeoutMs ?? 14000,
  );
  if (response.status !== "ok") return response;
  const catalog = parseAlpsRouteCatalog(response.body);
  return catalog ? { status: "ok", catalog } : { status: "malformed_response" };
}
