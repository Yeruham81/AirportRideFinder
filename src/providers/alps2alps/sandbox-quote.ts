/**
 * Pure, conservative parsing for Amitours B2B API v2 SANDBOX.
 *
 * POST /transfer creates a provider-side transfer *request* with priced
 * selections. It is NOT the booking endpoint; do not call any booking API.
 *
 * Only requested-pickup-time offers are presented. "off_peak" alternatives
 * differ in pickup time and must not be silently presented as equivalents.
 */
import { isPastPickup, isValidDateString, isValidTimeString } from "@/domain/time";
import { moneyFromDecimal, type Money } from "@/domain/money";

export const ALPS_SANDBOX_BASE = "https://sandbox.amitours.com/api/v2" as const;
export const ALPS_AFFILIATE_CODE = "AIRPORTRIDEFINDER" as const;
export const ALPS_PREVIEW_ROUTE = {
  from: "airport-1",
  to: "resort-11",
  originLabel: "Geneva Airport",
  destinationLabel: "Chamonix",
} as const;

export interface AlpsQuoteQuery {
  date: string;
  time: string;
  passengers: number;
}

export interface AlpsPreviewOffer {
  id: string;
  vehicleLabel: string;
  maxPassengers: number | null;
  price: Money;
  /** The transfer may not be guaranteed until checkout. */
  pickupTime: string | null;
  /** No luggage, cancellation or included-fee inference from this endpoint. */
  source: "sandbox";
  actionable: false;
}

export type AlpsQuoteValidation = { ok: true; value: AlpsQuoteQuery }
  | { ok: false };

export function validateAlpsQuoteQuery(value: AlpsQuoteQuery, now = new Date()): AlpsQuoteValidation {
  if (!isValidDateString(value.date) || !isValidTimeString(value.time) ||
    isPastPickup(value.date, value.time, "Europe/Zurich", now) ||
    !Number.isSafeInteger(value.passengers) ||
    value.passengers < 1 || value.passengers > 16) return { ok: false };
  return { ok: true, value };
}

export function buildAlpsQuoteBody(query: AlpsQuoteQuery) {
  if (!validateAlpsQuoteQuery(query).ok) throw new Error("Invalid Alps2Alps quote query");
  return {
    Transfer: {
      type: "private",
      is_return: 0,
      route_from_code: ALPS_PREVIEW_ROUTE.from,
      route_to_code: ALPS_PREVIEW_ROUTE.to,
      outbound_date: query.date,
      outbound_time_hours: Number(query.time.slice(0, 2)),
      outbound_time_minutes: Number(query.time.slice(3, 5)),
      outbound_selected_time_is_flight: 0,
      adult_count: query.passengers,
      children_count: 0,
    },
    AdditionalInformation: [],
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function positiveInteger(value: unknown): number | null {
  const n = typeof value === "string" && /^\d{1,4}$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= 1000
    ? n : null;
}
function priceInEur(value: unknown): Money | null {
  const decimal = typeof value === "number" && Number.isFinite(value)
    ? String(value) : value;
  if (typeof decimal !== "string" || !/^\d{1,9}(?:\.\d{1,2})?$/.test(decimal)) return null;
  try {
    const money = moneyFromDecimal("EUR", decimal);
    return money.minor > 0 ? money : null;
  } catch {
    return null;
  }
}
export interface AlpsVehicle {
  id: number;
  name: string;
  maxPassengers: number | null;
}

export function parseAlpsVehicles(body: unknown): Map<number, AlpsVehicle> {
  const entries = record(body);
  const result = new Map<number, AlpsVehicle>();
  if (!entries) return result;
  for (const [key, value] of Object.entries(entries).slice(0, 300)) {
    const id = positiveInteger(key);
    const item = record(value);
    if (!id || !item || positiveInteger(item["id"]) !== id) continue;
    const name = item["name"];
    if (typeof name !== "string" || !name.trim() || name.length > 120) continue;
    result.set(id, {
      id, name: name.trim(),
      maxPassengers: positiveInteger(item["max_passengers"]),
    });
  }
  return result;
}

export interface AlpsParseResult {
  offers: AlpsPreviewOffer[];
  omitted: number;
  validShape: boolean;
}

export function parseAlpsTransfer(
  body: unknown,
  vehicles: ReadonlyMap<number, AlpsVehicle>,
): AlpsParseResult {
  const transfer = record(record(body)?.["Transfer"]);
  const selection = record(transfer?.["TransferSelection"]);
  const outbound = record(selection?.["outbound"]);
  const offers = record(outbound?.["offers"]);
  if (!offers) return { validShape: false, offers: [], omitted: 0 };
  const found: AlpsPreviewOffer[] = [];
  let omitted = 0;
  for (const [code, raw] of Object.entries(offers).slice(0, 300)) {
    // Display only the exact requested-time class, not off-peak alternatives.
    if (!/^requested-[a-zA-Z0-9_-]{1,40}$/.test(code)) continue;
    const item = record(raw);
    const vehicleId = positiveInteger(item?.["vehicle_type_id"]);
    const price = priceInEur(item?.["price"]);
    if (!item || !vehicleId || !price) { omitted++; continue; }
    const vehicle = vehicles.get(vehicleId);
    const pickup = item["pick_up_date_time"];
    found.push({
      id: code,
      vehicleLabel: vehicle?.name ?? `Vehicle type ${vehicleId}`,
      maxPassengers: vehicle?.maxPassengers ?? null,
      price,
      pickupTime: typeof pickup === "string" &&
        /^\d{4}-\d{2}-\d{2} \d{2}:[0-5]\d:[0-5]\d$/.test(pickup)
        ? pickup : null,
      source: "sandbox",
      actionable: false,
    });
  }
  found.sort((a, b) => a.price.minor - b.price.minor || a.id.localeCompare(b.id));
  return { validShape: true, offers: found, omitted };
}
