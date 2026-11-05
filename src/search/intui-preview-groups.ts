/**
 * Presentation grouping for verified, already filtered Intui offers.
 * Does not request, mutate, enrich or invent provider data.
 */
import { CATEGORY_ORDER } from "@/domain/vehicle-taxonomy";
import type { NormalizedTransferOffer, VehicleCategory } from "@/domain/types";

export interface IntuiPreviewGroup {
  category: VehicleCategory;
  offers: NormalizedTransferOffer[];
  /** Null when currencies differ: never label one currency as the universal cheapest. */
  lowest: NormalizedTransferOffer | null;
}

/** Category display order is independent of price; within each section the
 * user's price sort (already applied by selectIntuiPreviewOffers) is retained.
 */
export function groupIntuiPreviewOffers(
  sortedOffers: readonly NormalizedTransferOffer[],
): IntuiPreviewGroup[] {
  return CATEGORY_ORDER.flatMap((category) => {
    const offers = sortedOffers.filter((offer) =>
      offer.providerId === "intui" && offer.source === "live" &&
      offer.category === category,
    );
    if (!offers.length) return [];
    const currency = offers[0]?.price.quotedPrice.currency;
    const sameCurrency = offers.every((offer) =>
      offer.price.quotedPrice.currency === currency,
    );
    const lowest = sameCurrency
      ? offers.reduce((best, offer) =>
          offer.price.quotedPrice.minor < best.price.quotedPrice.minor
            ? offer : best,
        )
      : null;
    return [{ category, offers, lowest }];
  });
}

/**
 * Grounded highlight: only the cheapest quoted price in the same
 * currency/category (ties are allowed) receives the lowest-price marker.
 */
export function isGroupLowestPrice(
  offer: NormalizedTransferOffer,
  lowest: NormalizedTransferOffer | null,
): boolean {
  return lowest !== null &&
    offer.price.quotedPrice.currency === lowest.price.quotedPrice.currency &&
    offer.price.quotedPrice.minor === lowest.price.quotedPrice.minor;
}
