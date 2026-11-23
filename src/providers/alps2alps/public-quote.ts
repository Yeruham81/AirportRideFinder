/**
 * Keyless, quote-only Public API with supplier-issued affiliate links.
 * Only an explicit user click opens checkout; API calls never create bookings.
 */
import { moneyFromDecimal, type Money } from "@/domain/money";
import { isValidDateString, isValidTimeString, isPastPickup } from "@/domain/time";
import { ALPS_PARTNER_CODE, ALPS_QUOTE_MAX_AGE_MS, isAlpsBookingUrl } from "./booking-link";
export { ALPS_PARTNER_CODE, ALPS_QUOTE_MAX_AGE_MS } from "./booking-link";

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

export type AlpsBagMode = "winter" | "summer";

/** Resolve the supplier's current season from an OMITTED-baggage response. */
export function alpsSeasonalBagMode(luggage: unknown): AlpsBagMode | null {
  const extras = record(luggage);
  const suitcases = within(extras?.["normal_suitcases"]);
  const skis = within(extras?.["ski_bags"]);
  if (suitcases === 0 && skis !== null && skis > 0) return "winter";
  if (skis === 0 && suitcases !== null && suitcases > 0) return "summer";
  return null;
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
  children?: number;
  infants?: number;
  childSeats?: number;
  boosters?: number;
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
  providerId: "alps2alps";
  actionable: boolean;
  /** Exact supplier string; never rebuilt or decorated. */
  bookingUrl: string | null;
  quotedAt: number;
  expiresAt: number;
}
export type AlpsPublicQuoteResult =
  | { status: "invalid" | "timeout" | "network_error" | "rate_limited" | "malformed_response" | "no_offers" | "route_unavailable" | "season_unavailable" | "ski_unavailable" }
  | { status: "http_error"; httpStatus: number }
  | { status: "quote_mismatch"; field: AlpsQuoteMismatchField; requested?: number; quoted?: number }
  | {
      status: "ok";
      offers: AlpsPublicOffer[];
      pickupTime: string;
      luggage: number;
      skiBags: number;
      bagMode: AlpsBagMode;
      discountPercent: number | null;
      quotedAt: number;
      expiresAt: number;
      route: { from: string; to: string };
      quoteUrl: string | null;
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
  const counts = [query.children ?? 0, query.infants ?? 0, query.childSeats ?? 0, query.boosters ?? 0];
  return counts.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 15) &&
    query.passengers + (query.children ?? 0) + (query.infants ?? 0) <= 16 &&
    (query.childSeats ?? 0) + (query.boosters ?? 0) <= (query.children ?? 0) + (query.infants ?? 0) &&
    validAlpsLocationCode(query.from) && validAlpsLocationCode(query.to) &&
    query.from !== query.to &&
    isValidDateString(query.date) && isValidTimeString(query.time) &&
    // Supported Alpine destinations use Central European local pickup time.
    isPastPickup(query.date, query.time, "Europe/Zurich", now) === false &&
    Number.isSafeInteger(query.passengers) && query.passengers >= 1 && query.passengers <= 16 &&
    Number.isSafeInteger(query.luggage) && query.luggage >= 0 && query.luggage <= 8 &&
    Number.isSafeInteger(query.skiBags) && query.skiBags >= 0 && query.skiBags <= 8 &&
    knownCurrency(query.currency);
}

export function buildAlpsPublicQuoteUrl(query: AlpsPublicQuoteQuery, bagMode?: AlpsBagMode): string {
  if (!validateAlpsPublicQuery(query)) throw new Error("Invalid Alps public quote request");
  const url = new URL(ALPS_PUBLIC_QUOTE_ENDPOINT);
  url.searchParams.set("from", query.from);
  url.searchParams.set("to", query.to);
  url.searchParams.set("date", query.date);
  url.searchParams.set("time", query.time);
  url.searchParams.set("adults", String(query.passengers));
  url.searchParams.set("children", String(query.children ?? 0));
  url.searchParams.set("infants", String(query.infants ?? 0));
  url.searchParams.set("child_seats", String(query.childSeats ?? 0));
  url.searchParams.set("boosters", String(query.boosters ?? 0));
  if (bagMode) {
    // Laura's 23 Nov contract: winter uses ONE count for all physical bags.
    const skiBags = bagMode === "winter" ? query.luggage + query.skiBags : 0;
    url.searchParams.set("luggage", String(bagMode === "summer" ? query.luggage : 0));
    url.searchParams.set("ski_bags", String(skiBags));
    url.searchParams.set("ski", skiBags > 0 ? "1" : "0");
  }
  url.searchParams.set("is_flight", "0"); // Treat time as the pickup time, not flight arrival.
  url.searchParams.set("currency", query.currency);
  url.searchParams.set("pc", ALPS_PARTNER_CODE);
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
  input: unknown, kind: "quote" | "vehicle", query: AlpsPublicQuoteQuery,
  bagMode: AlpsBagMode, vehicleId?: number,
): string | null {
  if (!isAlpsBookingUrl(input, kind)) return null;
  const params = new URL(input).searchParams;
  const expected = new URL(buildAlpsPublicQuoteUrl(query, bagMode)).searchParams;
  for (const [key, value] of expected) {
    // The supplier may omit fields whose documented default is zero or EUR.
    const actual = params.get(key) ?? (["children", "infants", "child_seats", "boosters"].includes(key)
      ? "0" : key === "currency" ? "EUR" : null);
    if (actual !== value) return null;
  }
  if (kind === "vehicle" && params.get("vehicle") !== String(vehicleId)) return null;
  return input;
}

function quoteIdentityError(body: unknown, query: AlpsPublicQuoteQuery): AlpsPublicQuoteResult | null {
  const root = record(body);
  const route = record(root?.["route"]);
  const outbound = record(root?.["outbound"]);
  const passengers = record(root?.["passengers"]);
  if (!root || !route || !outbound || !passengers || !safeLabel(route["from"]) ||
    !safeLabel(route["to"]) || !Array.isArray(outbound["vehicles"]) || root["return"] != null)
    return { status: "malformed_response" };
  if (root["currency"] !== query.currency) return { status: "quote_mismatch", field: "currency" };
  if (route["from_code"] !== query.from || route["to_code"] !== query.to)
    return { status: "quote_mismatch", field: "route" };
  const expected = { adults: query.passengers, children: query.children ?? 0,
    infants: query.infants ?? 0, child_seats: query.childSeats ?? 0, boosters: query.boosters ?? 0 };
  if (Object.entries(expected).some(([key, value]) => passengers[key] !== value))
    return { status: "quote_mismatch", field: "passengers" };
  if (outbound["pick_up_date_time"] !== `${query.date} ${query.time}:00`)
    return { status: "quote_mismatch", field: "pickup_time" };
  return null;
}

/** Preserve supplier prices and URLs; validate the complete requested basket. */
export function parseAlpsPublicQuote(
  body: unknown, query: AlpsPublicQuoteQuery, bagMode: AlpsBagMode, quotedAt = Date.now(),
): AlpsPublicQuoteResult {
  const identityError = quoteIdentityError(body, query);
  if (identityError) return identityError;
  const root = record(body)!;
  const route = record(root["route"])!;
  const outbound = record(root["outbound"])!;
  const extras = record(outbound["luggage"]);
  const luggage = within(extras?.["normal_suitcases"]);
  const skiBags = within(extras?.["ski_bags"]);
  const equipment = within(extras?.["ski_equipment"], 1);
  if (luggage === null || skiBags === null || equipment === null) return { status: "malformed_response" };
  if (bagMode === "summer" && query.skiBags > 0) return { status: "ski_unavailable" };
  const expectedLuggage = bagMode === "summer" ? query.luggage : 0;
  const expectedSkis = bagMode === "winter" ? query.luggage + query.skiBags : 0;
  if (luggage !== expectedLuggage)
    return { status: "quote_mismatch", field: "suitcases", requested: expectedLuggage, quoted: luggage };
  if (skiBags !== expectedSkis || equipment !== (expectedSkis > 0 ? 1 : 0))
    return { status: "quote_mismatch", field: "ski_bags", requested: expectedSkis, quoted: skiBags };

  const expiresAt = quotedAt + ALPS_QUOTE_MAX_AGE_MS;
  const offers: AlpsPublicOffer[] = [];
  const seen = new Set<number>();
  for (const raw of (outbound["vehicles"] as unknown[]).slice(0, 100)) {
    const item = record(raw);
    if (!item || item["offer_code"] !== "requested") continue;
    const vehicleId = within(item["vehicle_type_id"], 100000);
    const label = safeLabel(item["name"]);
    const price = money(item["price"], query.currency);
    if (vehicleId === null || vehicleId === 0 || !label || !price || seen.has(vehicleId)) continue;
    seen.add(vehicleId);
    const bookingUrl = safeVendorUrl(item["booking_url"], "vehicle", query, bagMode, vehicleId);
    // The provider already filtered vehicles for ALL passengers and bags.
    // max_luggage describes suitcases and is not a winter total-bag capacity.
    offers.push({
      id: `public-vehicle-${vehicleId}`, vehicleLabel: label,
      maxPassengers: within(item["max_passengers"]), maxLuggage: within(item["max_luggage"]),
      price, pickupTime: String(outbound["pick_up_date_time"]),
      source: "public_live", providerId: "alps2alps", actionable: bookingUrl !== null,
      bookingUrl, quotedAt, expiresAt,
    });
  }
  offers.sort((a, b) => a.price.minor - b.price.minor || a.id.localeCompare(b.id));
  if (!offers.length) return { status: "no_offers" };
  const discount = record(root["promo_code_discount"]);
  const discountPercent = root["promo_code_applied"] === true &&
    root["promo_code"] === ALPS_PARTNER_CODE &&
    ["percent", "percentage"].includes(String(discount?.["type"]))
    ? within(discount?.["value"], 100) : null;
  return {
    status: "ok", offers, pickupTime: String(outbound["pick_up_date_time"]),
    luggage, skiBags, bagMode, discountPercent, quotedAt, expiresAt,
    route: { from: String(route["from"]), to: String(route["to"]) },
    quoteUrl: safeVendorUrl(root["quote_url"], "quote", query, bagMode),
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

/** Browser-local pacing supplements the supplier's authoritative per-IP limit. */
export class AlpsQuoteLimiter {
  private requests: number[] = [];
  private blockedUntil = 0;
  constructor(private readonly now: () => number = () => Date.now()) {}
  take(): boolean {
    const now = this.now();
    this.requests = this.requests.filter(time => time > now - 60_000);
    if (now < this.blockedUntil || this.requests.length >= 20) return false;
    this.requests.push(now);
    return true;
  }
  backoff(): void { this.blockedUntil = this.now() + 60_000; }
}
const browserQuoteLimiter = new AlpsQuoteLimiter();

export async function fetchAlpsPublicQuote(
  query: AlpsPublicQuoteQuery,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number; limiter?: AlpsQuoteLimiter } = {},
): Promise<AlpsPublicQuoteResult> {
  if (!validateAlpsPublicQuery(query)) return { status: "invalid" };
  const limiter = options.limiter ?? browserQuoteLimiter;
  const request = async (bagMode?: AlpsBagMode) => {
    if (!limiter.take()) return { status: "rate_limited" } as const;
    const answer = await publicJson(buildAlpsPublicQuoteUrl(query, bagMode),
      options.fetchImpl ?? fetch, options.timeoutMs ?? 12000);
    if (answer.status === "rate_limited") limiter.backoff();
    return answer;
  };
  // Omit BOTH baggage parameters to learn this journey's current season.
  // Discovery prices are discarded; only the second, explicit basket is shown.
  const discovery = await request();
  if (discovery.status !== "ok") return discovery;
  const identityError = quoteIdentityError(discovery.body, query);
  if (identityError) return identityError;
  const bagMode = alpsSeasonalBagMode(record(record(discovery.body)?.["outbound"])?.["luggage"]);
  if (!bagMode) return { status: "season_unavailable" };
  if (bagMode === "summer" && query.skiBags > 0) return { status: "ski_unavailable" };
  const response = await request(bagMode);
  return response.status === "ok" ? parseAlpsPublicQuote(response.body, query, bagMode) : response;
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
