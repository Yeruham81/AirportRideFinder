/**
 * GetTransfer route_info — pure request building and response parsing.
 * Phase 2A diagnostics only: nothing here produces NormalizedTransferOffer and
 * nothing feeds the public comparison. No network, no secrets, no React.
 *
 * Documented fields only (Travelpayouts GetTransfer API, GET /route_info):
 *   data.prices[type] = { min: string, min_float: number, book_now?: string }
 *   data.success, data.distance, data.duration
 * `book_now` is the immediate price; `min` / `min_float` are indicative
 * "from" values and are never treated as bookable quotes.
 */
import { currencySymbol, isSupportedCurrency, moneyFromDecimal, type Money } from "@/domain/money";

export const GETTRANSFER_SANDBOX_BASE = "https://gtrbox.org/api";
export const GETTRANSFER_SANDBOX_HOST = "gtrbox.org";

export interface RouteInfoQuery {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  pax: number;
  /** Local pickup datetime with UTC offset, e.g. 2026-10-23T14:00:00+01:00. */
  dateTo: string;
  currency?: string;
  distanceUnit?: "km" | "mi";
}

const DATE_TO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

export function buildRouteInfoUrl(q: RouteInfoQuery): string {
  if (!DATE_TO_RE.test(q.dateTo)) throw new Error("date_to must be local datetime with UTC offset");
  if (!Number.isInteger(q.pax) || q.pax < 1 || q.pax > 50) throw new Error("pax out of range");
  const pt = (p: { lat: number; lng: number }) => {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) throw new Error("invalid point");
    return `${p.lat},${p.lng}`;
  };
  const params = new URLSearchParams();
  params.append("points[]", pt(q.from));
  params.append("points[]", pt(q.to));
  params.set("with_prices", "true");
  params.set("pax", String(q.pax));
  params.set("date_to", q.dateTo);
  if (q.currency) params.set("currency", q.currency);
  if (q.distanceUnit) params.set("distance_unit", q.distanceUnit);
  const url = new URL(`${GETTRANSFER_SANDBOX_BASE}/route_info`);
  url.search = params.toString();
  if (url.hostname !== GETTRANSFER_SANDBOX_HOST) throw new Error("Sandbox host only");
  return url.toString();
}

export interface ParsedAmount {
  /** Provider string, kept verbatim. */
  raw: string;
  /** Exact money if the string unambiguously matches the requested currency, else null. */
  amount: Money | null;
}

export interface VehicleTypePrice {
  /** Provider vehicle-type key (e.g. "economy"), kept verbatim. */
  type: string;
  /** Immediate price. Null = absent → not bookable. */
  bookNow: ParsedAmount | null;
  /** Indicative "from" price — NOT a bookable quote. */
  indicativeMin: string | null;
  bookable: boolean;
}

export interface RouteInfoDiagnostics {
  success: boolean | null;
  distance: number | null;
  duration: number | null;
  requestedCurrency: string | null;
  prices: VehicleTypePrice[];
  /** Everything not documented above (luggage, cancellation, fees, expiry, booking URL…) is unknown. */
  unknown: readonly ["luggage", "cancellation", "fees", "vehicle_details", "expiry", "booking_url"];
}

/**
 * Conservative parse of a formatted amount ("€455", "$1,234.50", "455 USD").
 * Requires a currency marker matching the requested currency; otherwise null.
 */
export function parseFormattedAmount(raw: unknown, currency: string | null): ParsedAmount | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s || s.length > 32) return { raw: s.slice(0, 32), amount: null };
  if (!currency || !isSupportedCurrency(currency)) return { raw: s, amount: null };
  const m = /^(?:([A-Z]{3})\s?|([^\d\s.,+-]{1,3})\s?)?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s?([A-Z]{3}))?$/.exec(s);
  if (!m) return { raw: s, amount: null };
  const [, preCode, symbol, intPart, frac, postCode] = m;
  const markers = [preCode, symbol, postCode].filter(Boolean);
  if (markers.length !== 1) return { raw: s, amount: null };
  const marker = markers[0]!;
  const ok = marker === currency || (symbol !== undefined && symbol === currencySymbol(currency));
  if (!ok) return { raw: s, amount: null };
  try {
    const decimal = intPart!.replace(/,/g, "") + (frac ? `.${frac}` : "");
    return { raw: s, amount: moneyFromDecimal(currency, decimal) };
  } catch {
    return { raw: s, amount: null };
  }
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const TYPE_KEY_RE = /^[a-z_]{1,32}$/;

export function parseRouteInfo(body: unknown, requestedCurrency: string | null): RouteInfoDiagnostics | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const data = (b["data"] ?? b["Data"]) as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") return null;
  const pricesRaw = data["prices"];
  const prices: VehicleTypePrice[] = [];
  if (pricesRaw && typeof pricesRaw === "object") {
    for (const [type, v] of Object.entries(pricesRaw as Record<string, unknown>)) {
      if (!TYPE_KEY_RE.test(type) || !v || typeof v !== "object") continue;
      const p = v as Record<string, unknown>;
      const bookNow = parseFormattedAmount(p["book_now"], requestedCurrency);
      prices.push({
        type,
        bookNow,
        indicativeMin: typeof p["min"] === "string" ? p["min"].slice(0, 32) : null,
        bookable: bookNow?.amount != null,
      });
    }
  }
  return {
    success: typeof data["success"] === "boolean" ? data["success"] : null,
    distance: num(data["distance"]),
    duration: num(data["duration"]),
    requestedCurrency,
    prices,
    unknown: ["luggage", "cancellation", "fees", "vehicle_details", "expiry", "booking_url"],
  };
}
