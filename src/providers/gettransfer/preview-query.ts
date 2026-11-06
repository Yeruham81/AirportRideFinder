/**
 * Pure, bounded GETTRANSFER SANDBOX preview search model.
 * Only three explicit route pairs with known coordinates and pickup time zones.
 * Never interpret a sandbox price as a production or bookable offer.
 */
import { getLocation } from "@/data/locations";
import { isValidDateString, isValidTimeString, localDateTimeWithOffset } from "@/domain/time";
import type { RouteInfoQuery, VehicleTypePrice } from "./route-info";

export const GETTRANSFER_PREVIEW_ROUTES = [
  { id: "london", from: "lhr", to: "central-london", currency: "USD" },
  { id: "new-york", from: "jfk", to: "manhattan", currency: "USD" },
  { id: "paris", from: "cdg", to: "central-paris", currency: "EUR" },
] as const;

export interface GetTransferPreviewInput {
  routeId: string;
  date: string;
  time: string;
  passengers: number;
}

/**
 * Convert a wall-clock time at the *pickup* location to a fully offset-qualified
 * ISO datetime. Reject ambiguous and nonexistent local times around DST changes
 * instead of silently quoting a different departure time.
 */
export function getUnambiguousLocalInstant(
  date: string, time: string, timeZone: string,
): { instant: Date; dateTo: string } | null {
  if (!isValidDateString(date) || !isValidTimeString(time)) return null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const hour = Number(time.slice(0, 2));
  const minute = Number(time.slice(3, 5));
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const matches = new Map<number, { instant: Date; dateTo: string }>();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const probe = new Date(utcGuess + hours * 3600_000);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone, timeZoneName: "longOffset",
    }).formatToParts(probe);
    const zone = parts.find((part) => part.type === "timeZoneName")?.value;
    if (!zone) continue;
    const offset = zone === "GMT" ? "+00:00" : zone.replace("GMT", "");
    if (!/^[+-]\d\d:\d\d$/.test(offset)) continue;
    const instant = new Date(`${date}T${time}:00${offset}`);
    if (!Number.isFinite(instant.getTime())) continue;
    const dateTo = localDateTimeWithOffset(instant, timeZone);
    if (dateTo === `${date}T${time}:00${offset}`) {
      matches.set(instant.getTime(), { instant, dateTo });
    }
  }
  return matches.size === 1 ? [...matches.values()][0]! : null;
}

export function buildGetTransferPreviewQuery(
  input: GetTransferPreviewInput, now = new Date(),
): { query: RouteInfoQuery; routeLabel: string; dateTo: string } | null {
  const route = GETTRANSFER_PREVIEW_ROUTES.find((item) => item.id === input.routeId);
  if (!route || !Number.isSafeInteger(input.passengers) ||
    input.passengers < 1 || input.passengers > 16) return null;
  const from = getLocation(route.from);
  const to = getLocation(route.to);
  if (!from?.coords || !to?.coords || !from.timeZone) return null;
  const local = getUnambiguousLocalInstant(input.date, input.time, from.timeZone);
  if (!local) return null;
  const leadTime = local.instant.getTime() - now.getTime();
  // Provider documentation requires at least six hours' lead time.
  if (leadTime < 6 * 3600_000 || leadTime > 366 * 86400_000) return null;
  return {
    query: {
      from: from.coords,
      to: to.coords,
      pax: input.passengers,
      dateTo: local.dateTo,
      currency: route.currency,
      distanceUnit: "km",
    },
    routeLabel: `${from.shortName} → ${to.shortName}`,
    dateTo: local.dateTo,
  };
}

/**
 * Render only returned GetTransfer sandbox categories that have a parsed
 * immediate `book_now` amount. Indicative-only categories are not offers and
 * should not clutter the private quote preview. This does not establish
 * production availability or enable customer booking.
 */
export function visibleGetTransferSandboxQuotes(prices: readonly VehicleTypePrice[]) {
  return prices.flatMap((entry) => {
    const price = entry.bookNow?.amount;
    if (!price || price.minor <= 0) return [];
    return [{
      type: entry.type,
      price,
      indicativeMin: entry.indicativeMin,
    }];
  }).slice(0, 24);
}
