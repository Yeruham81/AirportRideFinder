import type { CancellationPolicy, NormalizedTransferOffer } from "@/domain/types";
import type { IntuiGeoRequest } from "./request";

const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const integer = (v: unknown, min: number): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min ? v : null;
const text = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 200 ? v : null;

export interface IntuiVehicleDiagnostic {
  maxPassengers: number;
  maxLuggage: number;
  vehicleType: string | null;
  bodyType: string | null;
  vehicleClass: string | null;
  cancellation: CancellationPolicy;
  meetAndGreet: boolean | null;
  priceStatus: "unverified_shape";
  trackingEnabled: false;
}

export type IntuiParseResult =
  | { status: "authorization_error" | "wrong_params" | "malformed_response" }
  | { status: "no_offers"; offers: NormalizedTransferOffer[]; diagnostics: IntuiVehicleDiagnostic[] }
  | { status: "unverified_price_contract"; offers: NormalizedTransferOffer[]; diagnostics: IntuiVehicleDiagnostic[]; omittedCount: number };

/**
 * Official article documents allprice semantics, but not its concrete JSON type
 * or currency-key nesting. No sample response has been independently validated.
 * TODO: verify that shape before moneyFromDecimal/normalization is enabled.
 * Never reinterpret a min/per-person value as a total or return raw booking URLs.
 */
export function parseIntuiResponse(body: unknown, request: IntuiGeoRequest): IntuiParseResult {
  if (request.currency !== "USD" && request.currency !== "EUR") return { status: "malformed_response" };
  const root = record(body);
  if (root?.["status"] === "authorization_error") return { status: "authorization_error" };
  if (root?.["status"] === "wrong_params") return { status: "wrong_params" };
  const location = record(root?.["LocationInfo"]);
  const travelling = location?.["travelling"];
  if (root?.["status"] !== "ok" || !Array.isArray(travelling)) return { status: "malformed_response" };
  if (travelling.length === 0) return { status: "no_offers", offers: [], diagnostics: [] };
  const diagnostics: IntuiVehicleDiagnostic[] = [];
  for (const raw of travelling) {
    const entry = record(raw);
    const info = record(entry?.["info"]);
    // Private capacities are required; shuttle/per-person pricing is unsupported.
    if (!info || info["vehicle_type"] !== "private") continue;
    const maxPassengers = integer(info["maxpax"], 1);
    const maxLuggage = integer(info["luggage"], 0);
    if (maxPassengers === null || maxLuggage === null) continue;
    const hours = integer(info["free_cancellation"], 0);
    const additional = record(entry?.["additional"]);
    diagnostics.push({
      maxPassengers, maxLuggage, vehicleType: text(info["vehicle_type"]),
      bodyType: text(info["type_vehicle"]), vehicleClass: text(info["vehicle_class"]),
      cancellation: hours !== null && hours > 0 ? { kind: "free_until", hoursBefore: hours } : { kind: "unknown" },
      meetAndGreet: additional?.["meet_greet"] === 1 ? true : additional?.["meet_greet"] === 0 ? false : null,
      priceStatus: "unverified_shape", trackingEnabled: false,
    });
  }
  // Nonempty but unusable data is not a successful zero-offer reply.
  return { status: "unverified_price_contract", offers: [], diagnostics, omittedCount: travelling.length };
}