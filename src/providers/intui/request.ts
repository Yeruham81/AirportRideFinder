import { isValidDateString, isValidTimeString } from "@/domain/time";
import type { NormalizedLocation, TransferSearchRequest } from "@/domain/types";

/** Official GEO example uses `geo`; no credentials belong in this pure object. */
export interface IntuiGeoRequest {
  coordinatesType: "GEO";
  gpsLatR: number;
  gpsLngR: number;
  gpsLatEnd: number;
  gpsLngEnd: number;
  adults: number;
  arrivalDateTime: string;
  currency: "USD" | "EUR";
  lang: "en";
  multiprice: false;
}

export function buildIntuiGeoRequest(
  request: TransferSearchRequest,
  pickup: NormalizedLocation,
  dropoff: NormalizedLocation,
): IntuiGeoRequest {
  if (request.pickupId !== pickup.id || request.dropoffId !== dropoff.id || pickup.id === dropoff.id)
    throw new Error("invalid_locations");
  if (request.returnTrip != null) throw new Error("one_way_only");
  if (request.timeZone !== pickup.timeZone) throw new Error("pickup_zone_mismatch");
  try { new Intl.DateTimeFormat("en", { timeZone: pickup.timeZone }); }
  catch { throw new Error("invalid_pickup_zone"); }
  if (!isValidDateString(request.localDate) || !isValidTimeString(request.localTime) ||
      Number(request.localTime.slice(3)) % 5 !== 0) throw new Error("invalid_pickup_datetime");
  if (!Number.isSafeInteger(request.passengers) || request.passengers < 1)
    throw new Error("invalid_adults");
  if (!Number.isSafeInteger(request.luggage) || request.luggage < 0) throw new Error("invalid_luggage");
  const from = pickup.coords;
  const to = dropoff.coords;
  const validPoint = (p: NormalizedLocation["coords"]) => p &&
    Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 &&
    Number.isFinite(p.lng) && Math.abs(p.lng) <= 180;
  if (!from || !to || !validPoint(from) || !validPoint(to) ||
      (from.lat === to.lat && from.lng === to.lng)) throw new Error("invalid_coordinates");
  const currency = request.preferredCurrency ??
    (pickup.timeZone === "Europe/Paris" ? "EUR" :
      ["Europe/London", "America/New_York"].includes(pickup.timeZone) ? "USD" : null);
  if (currency !== "USD" && currency !== "EUR") throw new Error("unsupported_currency");
  return {
    coordinatesType: "GEO", gpsLatR: from.lat, gpsLngR: from.lng,
    gpsLatEnd: to.lat, gpsLngEnd: to.lng, adults: request.passengers,
    arrivalDateTime: `${request.localDate}T${request.localTime}:00`,
    currency, lang: "en", multiprice: false,
  };
}