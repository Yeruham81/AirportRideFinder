import type { CancellationPolicy, NormalizedTransferOffer } from "@/domain/types";
import type { IntuiGeoRequest } from "./request";

const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;

function unsignedInt(v: unknown, min: number): number | null {
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= min ? v : null;
  if (typeof v === "string" && /^(0|[1-9][0-9]{0,7})$/.test(v)) {
    const n = Number(v);
    return Number.isSafeInteger(n) && n >= min ? n : null;
  }
  return null;
}
const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 200 ? v : null;

/**
 * The 05-Nov-2026 read-only diagnostic confirmed a response wrapper:
 * { status:"ok", response: { "<route-key>": { LocationInfo, travelling:[...] } } }.
 * Never use the dynamic key as a booking link or as an external identifier.
 */
export function findIntuiTravelling(body: unknown): unknown[] | null {
  const root = record(body);
  if (!root) return null;
  const wrapper = record(root["response"]);
  if (wrapper) {
    const groups = Object.values(wrapper).map(record).filter((x) => x !== null);
    // Exactly one requested one-way route; reject ambiguous/multiple results.
    if (groups.length !== 1 || !Array.isArray(groups[0]?.["travelling"])) return null;
    return groups[0]["travelling"] as unknown[];
  }
  // Legacy documented illustration; maintained only for mock compatibility.
  const legacy = record(root["LocationInfo"])?.["travelling"];
  return Array.isArray(legacy) ? legacy : null;
}

export interface IntuiVehicleDiagnostic {
  maxPassengers: number;
  maxLuggage: number;
  vehicleType: string | null;
  bodyType: string | null;
  vehicleClass: string | null;
  cancellation: CancellationPolicy;
  meetAndGreet: boolean | null;
  /** Only the JSON shape was confirmed, not taxes, pricing rules, or attribution. */
  requestedCurrencyPriceType: "number" | "missing_or_invalid";
  priceStatus: "unverified_contract";
  trackingEnabled: false;
}

export type IntuiParseResult =
  | { status: "authorization_error" | "wrong_params" | "malformed_response" }
  | { status: "no_offers"; offers: NormalizedTransferOffer[]; diagnostics: IntuiVehicleDiagnostic[] }
  | { status: "unverified_price_contract"; offers: NormalizedTransferOffer[]; diagnostics: IntuiVehicleDiagnostic[]; omittedCount: number };

/**
 * Safe metadata-only parser.
 *
 * Verified in a ONE-SHOT, READ-ONLY diagnostic: 102 candidate entries under
 * response.<dynamic-key>.travelling, info.maxpax and free_cancellation encoded
 * as strings, and pricing.allprice.USD a JSON number. Neither the total/fees
 * semantics nor booking/affiliate links have been verified. No offer emitted.
 */
export function parseIntuiResponse(body: unknown, request: IntuiGeoRequest): IntuiParseResult {
  if (request.currency !== "USD" && request.currency !== "EUR") return { status: "malformed_response" };
  const root = record(body);
  if (root?.["status"] === "authorization_error") return { status: "authorization_error" };
  if (root?.["status"] === "wrong_params") return { status: "wrong_params" };
  if (root?.["status"] !== "ok") return { status: "malformed_response" };

  const travelling = findIntuiTravelling(root);
  if (!travelling) return { status: "malformed_response" };
  if (travelling.length === 0) return { status: "no_offers", offers: [], diagnostics: [] };

  const diagnostics: IntuiVehicleDiagnostic[] = [];
  for (const raw of travelling) {
    const entry = record(raw);
    const info = record(entry?.["info"]);
    if (!info) continue;
    const maxPassengers = unsignedInt(info["maxpax"], 1);
    const maxLuggage = unsignedInt(info["luggage"], 0);
    if (maxPassengers === null || maxLuggage === null) continue;
    const cancellationHours = unsignedInt(info["free_cancellation"], 0);
    const additional = record(entry?.["additional"]);
    const price = record(record(entry?.["pricing"])?.["allprice"])?.[request.currency];
    const hasNumericPrice = typeof price === "number" && Number.isFinite(price) && price > 0;

    diagnostics.push({
      maxPassengers, maxLuggage,
      vehicleType: text(info["vehicle_type"]),
      bodyType: text(info["type_vehicle"]),
      vehicleClass: text(info["vehicle_class"]),
      cancellation: cancellationHours !== null && cancellationHours > 0
        ? { kind: "free_until", hoursBefore: cancellationHours }
        : { kind: "unknown" },
      meetAndGreet: additional?.["meet_greet"] === 1 ? true
        : additional?.["meet_greet"] === 0 ? false : null,
      requestedCurrencyPriceType: hasNumericPrice ? "number" : "missing_or_invalid",
      priceStatus: "unverified_contract",
      trackingEnabled: false,
    });
  }

  return {
    status: "unverified_price_contract", offers: [],
    diagnostics, omittedCount: travelling.length,
  };
}
