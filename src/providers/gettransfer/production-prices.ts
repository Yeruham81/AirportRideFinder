/**
 * A production-only diagnostic view model, NOT normalized comparison offers.
 * Indicative minimums remain visibly distinct from immediate Book Now prices.
 */
import type { Money } from "@/domain/money";
import type { VehicleTypePrice } from "./route-info";

export interface ProductionCategoryPrice {
  type: string;
  indicativeMin: string | null;
  bookNow: Money | null;
}

export function visibleProductionPrices(prices: readonly VehicleTypePrice[]): ProductionCategoryPrice[] {
  return prices.flatMap((price) => {
    const indicativeMin = price.indicativeMin?.trim() || null;
    const parsed = price.bookNow?.amount ?? null;
    const bookNow = parsed && parsed.minor > 0 ? parsed : null;
    if (!indicativeMin && !bookNow) return [];
    return [{ type: price.type, indicativeMin, bookNow }];
  }).slice(0, 24);
}
