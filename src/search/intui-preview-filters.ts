/**
 * Pure client-side selectors for already-retrieved Intui quotes.
 * Filtering NEVER triggers a new provider API request.
 */
import { moneyFromDecimal } from "@/domain/money";
import type { NormalizedTransferOffer, VehicleCategory } from "@/domain/types";

export type IntuiPreviewSort = "price_asc" | "price_desc";

export interface IntuiPreviewFilters {
  category: VehicleCategory | "all";
  /** Minimum seat capacity of an already-returned transfer. */
  passengers: number;
  /** Minimum luggage capacity of an already-returned transfer. */
  luggage: number;
  minPriceMinor: number | null;
  maxPriceMinor: number | null;
  sort: IntuiPreviewSort;
}

/**
 * Parse a user-entered price without rounding or floating-point multiplication.
 * null = empty/no bound; undefined = invalid (not silently ignored).
 */
export function parsePreviewPrice(
  text: string,
  currency: string,
): number | null | undefined {
  const value = text.trim();
  if (value === "") return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  try {
    const amount = moneyFromDecimal(currency, value);
    return amount.minor >= 0 ? amount.minor : undefined;
  } catch {
    return undefined;
  }
}

/** Stable price ordering, with original offer order preserved on a tie. */
export function selectIntuiPreviewOffers(
  offers: readonly NormalizedTransferOffer[],
  filters: IntuiPreviewFilters,
): NormalizedTransferOffer[] {
  return offers
    .map((offer, index) => ({ offer, index }))
    .filter(({ offer }) => {
      if (offer.providerId !== "intui" || offer.source !== "live") return false;
      if (filters.category !== "all" && offer.category !== filters.category) return false;
      if (offer.maxPassengers < filters.passengers || offer.maxLuggage < filters.luggage) return false;
      const price = offer.price.quotedPrice.minor;
      if (filters.minPriceMinor !== null && price < filters.minPriceMinor) return false;
      if (filters.maxPriceMinor !== null && price > filters.maxPriceMinor) return false;
      return true;
    })
    .sort((a, b) => {
      // Never numerically compare different currencies. Group currencies first;
      // the Intui request normally returns one currency per search.
      const aMoney = a.offer.price.quotedPrice;
      const bMoney = b.offer.price.quotedPrice;
      if (aMoney.currency !== bMoney.currency) {
        return aMoney.currency.localeCompare(bMoney.currency);
      }
      const diff = aMoney.minor - bMoney.minor;
      return (filters.sort === "price_asc" ? diff : -diff) || a.index - b.index;
    })
    .map(({ offer }) => offer);
}
