/**
 * Pure, conservative Intui private-transfer offer normalization.
 * No secret, network request, booking link or React dependency.
 *
 * Intui/Travelpayouts documents pricing.allprice as the TOTAL transfer price
 * (not a per-person amount); extras and fee inclusion may vary. Quotes are
 * marked with fees: unknown and cannot be booked from AirportRideFinder.
 */
import { moneyFromDecimal } from "@/domain/money";
import type { NormalizedTransferOffer, VehicleCategory } from "@/domain/types";
import type { IntuiGeoRequest } from "./request";
import { findIntuiTravelling } from "./response";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function asInteger(value: unknown, min = 0, max = 100): number | null {
  const n = typeof value === "number" ? value
    : typeof value === "string" && /^(0|[1-9][0-9]{0,14})$/.test(value) ? Number(value)
    : Number.NaN;
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}

function classifyBody(body: unknown, vehicleClass: unknown): VehicleCategory | null {
  if (typeof body !== "string" || typeof vehicleClass !== "string") return null;
  // Whitelist of documented Intui vehicle classes and bodies. All ambiguous,
  // non-road and combined modes are omitted, not grouped as interchangeable.
  const roadClass = ["Economy class", "Standard", "Business", "Luxury", "N/a"].includes(vehicleClass);
  if (!roadClass) return null;
  if (body === "Minivan") return "minivan";
  if (body === "Minibus" || body === "Bus" || body === "Coach") return "minibus";
  if (body === "Limousine" && vehicleClass === "Luxury") return "executive";
  const sedan = ["Sedan", "Station Wagon", "Hatchback"].includes(body);
  if (sedan && vehicleClass === "Economy class") return "economy_sedan";
  if (sedan && vehicleClass === "Standard") return "standard_sedan";
  if (sedan && vehicleClass === "Business") return "business_sedan";
  if (sedan && vehicleClass === "Luxury") return "executive";
  if (body === "High class sedan" && vehicleClass === "Business") return "business_sedan";
  if (body === "Superior High class sedan" && vehicleClass === "Luxury") return "executive";
  return null;
}

function safeMoney(amount: unknown, currency: IntuiGeoRequest["currency"]) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  // Number -> string is safe only when no exponent, fractional-cent or
  // additional precision is present. Never round a quote.
  const decimal = String(amount);
  if (!/^\d+(?:\.\d{1,2})?$/.test(decimal)) return null;
  try {
    const result = moneyFromDecimal(currency, decimal);
    return result.minor > 0 ? result : null;
  } catch {
    return null;
  }
}

export interface IntuiNormalizationContext {
  readonly searchRef: string;
  /** Actual server receipt time, supplied by the transport, never fabricated. */
  readonly retrievedAt: string;
  readonly passengers: number;
  readonly luggage: number;
}

export type IntuiNormalizationResult =
  | { status: "malformed_response"; offers: []; omittedCount: 0 }
  | {
    status: "ok" | "no_offers" | "no_verified_offers";
    offers: NormalizedTransferOffer[];
    omittedCount: number;
  };

/**
 * Return eligible, precisely priced PRIVATE road transfers only.
 * Deliberately do not expose or use intuiUrlOrderSingle: affiliate attribution
 * requires a Travelpayouts tracking link generated outside this API.
 */
export function normalizeIntuiOffers(
  body: unknown,
  query: IntuiGeoRequest,
  ctx: IntuiNormalizationContext,
): IntuiNormalizationResult {
  const root = asRecord(body);
  if (root?.["status"] !== "ok" ||
    !["USD", "EUR"].includes(query.currency) ||
    !Number.isSafeInteger(ctx.passengers) || ctx.passengers < 1 ||
    !Number.isSafeInteger(ctx.luggage) || ctx.luggage < 0 ||
    !Number.isFinite(Date.parse(ctx.retrievedAt)) ||
    !ctx.searchRef || ctx.searchRef.length > 300) {
    return { status: "malformed_response", offers: [], omittedCount: 0 };
  }
  const rows = findIntuiTravelling(root);
  if (!rows) return { status: "malformed_response", offers: [], omittedCount: 0 };
  if (rows.length === 0) return { status: "no_offers", offers: [], omittedCount: 0 };

  const offers: NormalizedTransferOffer[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < rows.length; index++) {
    const entry = asRecord(rows[index]);
    const info = asRecord(entry?.["info"]);
    if (!info || info["vehicle_type"] !== "private" ||
      info["perperson"] === true) continue;

    const providerId = asInteger(info["productid"], 1, Number.MAX_SAFE_INTEGER);
    const maxPassengers = asInteger(info["maxpax"], 1, 50);
    const maxLuggage = asInteger(info["luggage"], 0, 50);
    const category = classifyBody(info["type_vehicle"], info["vehicle_class"]);
    const allprice = asRecord(asRecord(entry?.["pricing"])?.["allprice"]);
    const quotedPrice = safeMoney(allprice?.[query.currency], query.currency);
    if (providerId === null || maxPassengers === null || maxLuggage === null ||
      category === null || quotedPrice === null ||
      maxPassengers < ctx.passengers || maxLuggage < ctx.luggage) continue;

    // Identical product ids in the same response cannot be treated as unique.
    const productKey = String(providerId);
    if (seen.has(productKey)) continue;
    seen.add(productKey);

    const freeCancellationHours = asInteger(info["free_cancellation"], 0, 8760);
    const meetGreet = asRecord(entry?.["additional"])?.["meet_greet"];
    const providerVehicleLabel = [info["vehicle_class"], info["type_vehicle"]]
      .filter((value) => typeof value === "string" && value.length <= 60)
      .join(" · ")
      .slice(0, 100);
    const offer: NormalizedTransferOffer = {
      id: `intui:${ctx.searchRef}:${providerId}`,
      providerId: "intui",
      providerOfferId: productKey,
      searchRef: ctx.searchRef,
      category,
      providerVehicleLabel,
      maxPassengers,
      maxLuggage,
      price: {
        quotedPrice,
        displayPrice: null,
        // allprice = total transfer, but not proof that every possible fee
        // or paid optional extra is already included.
        taxesAndFees: "unknown",
      },
      cancellation: freeCancellationHours !== null && freeCancellationHours > 0
        ? { kind: "free_until", hoursBefore: freeCancellationHours }
        : { kind: "unknown" },
      waitingTimeMins: null,
      meetAndGreet: meetGreet === 1 ? true : meetGreet === 0 ? false : null,
      conditions: [],
      bookingRef: "disabled",
      source: "live",
      quote: { kind: "live", retrievedAt: ctx.retrievedAt, expiresAt: null },
      actionable: false,
    };
    offers.push(offer);
  }
  return {
    status: offers.length ? "ok" : "no_verified_offers",
    offers,
    omittedCount: rows.length - offers.length,
  };
}
