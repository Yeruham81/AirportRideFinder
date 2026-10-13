import { compareMoney } from "@/domain/money";
import type { NormalizedTransferOffer, TransferSearchRequest, VehicleCategory } from "@/domain/types";
import { CATEGORY_ORDER } from "@/domain/vehicle-taxonomy";

export type CategoryFilter = "auto" | "all" | VehicleCategory;
export type CancellationFilter = "all" | "free" | "refundable";
export type SortOrder = "price_asc" | "price_desc";

export interface ComparisonState {
  category: CategoryFilter;
  cancellation: CancellationFilter;
  sort: SortOrder;
}

export const DEFAULT_STATE: ComparisonState = { category: "auto", cancellation: "all", sort: "price_asc" };

export function parseComparisonState(p: { cat?: string | undefined; cxl?: string | undefined; sort?: string | undefined }): ComparisonState {
  const category: CategoryFilter =
    p.cat === "all" || (CATEGORY_ORDER as string[]).includes(p.cat ?? "")
      ? (p.cat as CategoryFilter)
      : "auto";
  const cancellation: CancellationFilter =
    p.cxl === "free" || p.cxl === "refundable" ? p.cxl : "all";
  const sort: SortOrder = p.sort === "price_desc" ? "price_desc" : "price_asc";
  return { category, cancellation, sort };
}

/** Capacity check uses the offer's own capacities, never a generic class. */
export const fitsRequest = (o: NormalizedTransferOffer, r: TransferSearchRequest) =>
  o.maxPassengers >= r.passengers && o.maxLuggage >= r.luggage;

export function matchesCancellation(o: NormalizedTransferOffer, f: CancellationFilter): boolean {
  if (f === "all") return true;
  if (f === "free") return o.cancellation.kind === "free_until";
  // "refundable": free or with a fee; unknown terms are not assumed refundable.
  return o.cancellation.kind === "free_until" || o.cancellation.kind === "with_fee";
}

/** Sort by price within currency; offers in different currencies are never interleaved. */
export function sortOffers(offers: NormalizedTransferOffer[], order: SortOrder): NormalizedTransferOffer[] {
  const dir = order === "price_asc" ? 1 : -1;
  return [...offers].sort((a, b) => {
    const ca = a.price.quotedPrice.currency;
    const cb = b.price.quotedPrice.currency;
    if (ca !== cb) return ca < cb ? -1 : 1;
    const diff = compareMoney(a.price.quotedPrice, b.price.quotedPrice) * dir;
    return diff !== 0 ? diff : a.id < b.id ? -1 : 1;
  });
}

export function groupByCategory(offers: NormalizedTransferOffer[]) {
  const map = new Map<VehicleCategory, NormalizedTransferOffer[]>();
  for (const o of offers) map.set(o.category, [...(map.get(o.category) ?? []), o]);
  return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, offers: map.get(c)! }));
}
