import { getLocation, type DemoRoute } from "@/data/locations";
import { PROVIDERS } from "@/data/providers";
import { compareMoney } from "@/domain/money";
import type {
  NormalizedLocation,
  NormalizedTransferOffer,
  ProviderStatus,
  TransferProvider,
  TransferSearchRequest,
  VehicleCategory,
} from "@/domain/types";
import { CATEGORY_LABEL, defaultCategoryFor } from "@/domain/vehicle-taxonomy";
import {
  fitsRequest,
  groupByCategory,
  matchesCancellation,
  sortOffers,
  type CancellationFilter,
  type CategoryFilter,
  type ComparisonState,
} from "./compare";
import type { SearchResponse } from "./orchestrator";

export interface OfferCardModel {
  offer: NormalizedTransferOffer;
  provider: TransferProvider;
  isLowest: boolean;
}

export interface OfferSection {
  category: VehicleCategory;
  label: string;
  kind: "primary" | "alternative";
  offers: OfferCardModel[];
}

export type GlanceEntry =
  | { kind: "offer"; provider: TransferProvider; card: OfferCardModel }
  | { kind: "no_comparable"; provider: TransferProvider }
  | { kind: "unavailable"; provider: TransferProvider; status: "error" | "timeout" };

export type EmptyReason = "all_failed" | "unsupported_route" | "no_offers" | "capacity" | "filters";

export interface ComparisonViewModel {
  request: TransferSearchRequest;
  pickup: NormalizedLocation;
  dropoff: NormalizedLocation;
  demoRoute: DemoRoute | null;
  /** Sample currency of the route (null for unsupported routes). */
  currency: string | null;
  state: ComparisonState;
  /** "partial" only when a provider errored or timed out. */
  completeness: "complete" | "partial" | "all_failed";
  failedProviders: { provider: TransferProvider; status: "error" | "timeout" }[];
  respondedWithoutOffers: TransferProvider[];
  providerStatuses: { provider: TransferProvider; status: ProviderStatus }[];
  totalOffers: number;
  eligibleCount: number;
  hiddenForCapacity: number;
  defaultCategory: VehicleCategory | null;
  /** Class used for the at-a-glance strip and "Lowest sample price". */
  focusCategory: VehicleCategory | null;
  categoryOptions: { value: CategoryFilter; label: string; count: number }[];
  cancellationOptions: { value: CancellationFilter; label: string; count: number }[];
  glance: GlanceEntry[];
  sections: OfferSection[];
  primaryCount: number;
  alternativeCount: number;
  lowestOfferId: string | null;
  /** True when the cheapest comparable offer has unconfirmed fees, so no lowest-total claim is made. */
  lowestWithheldForFees: boolean;
  empty: EmptyReason | null;
}

const providerOf = (id: string) => PROVIDERS.find((p) => p.id === id)!;

/**
 * Single source of truth for everything the results page shows: the strip,
 * cards, counts, summary and labels all derive from this one object.
 */
export function buildViewModel(response: SearchResponse, state: ComparisonState): ComparisonViewModel {
  const { request, results, offers } = response;
  const pickup = getLocation(request.pickupId)!;
  const dropoff = getLocation(request.dropoffId)!;

  const failedProviders = results
    .filter((r) => r.status === "error" || r.status === "timeout")
    .map((r) => ({ provider: providerOf(r.providerId), status: r.status as "error" | "timeout" }));
  const failedIds = new Set(failedProviders.map((f) => f.provider.id));
  const respondedWithoutOffers = results
    .filter((r) => r.status === "no_offers")
    .map((r) => providerOf(r.providerId));
  const completeness =
    failedProviders.length === results.length && results.length > 0
      ? "all_failed"
      : failedProviders.length
        ? "partial"
        : "complete";

  const eligible = offers.filter((o) => fitsRequest(o, request));
  const defaultCategory = defaultCategoryFor(new Set(eligible.map((o) => o.category)));

  const byCancellation = eligible.filter((o) => matchesCancellation(o, state.cancellation));

  // Category scope for counts and display.
  const specific = state.category !== "auto" && state.category !== "all" ? state.category : null;
  const focusCategory = specific ?? defaultCategory;
  const inScope = specific ? byCancellation.filter((o) => o.category === specific) : byCancellation;

  // Lowest sample price: within the focus class and its currency only.
  const focusOffers = sortOffers(
    byCancellation.filter((o) => o.category === focusCategory),
    "price_asc",
  );
  // A "lowest total" claim is only made when the cheapest offer's mandatory
  // fees are confirmed as included and it is strictly cheaper than every
  // other comparable offer in the same currency (fees unknown/excluded ones included).
  const lowest = focusOffers[0] ?? null;
  const sameCurrency = lowest
    ? focusOffers.filter((o) => o.price.quotedPrice.currency === lowest.price.quotedPrice.currency)
    : [];
  const lowestOfferId =
    lowest &&
    sameCurrency.length > 1 &&
    lowest.price.taxesAndFees === "included" &&
    sameCurrency[1]!.price.quotedPrice.minor > lowest.price.quotedPrice.minor
      ? lowest.id
      : null;
  const lowestWithheldForFees =
    !!lowest && sameCurrency.length > 1 && lowest.price.taxesAndFees !== "included";

  const card = (offer: NormalizedTransferOffer): OfferCardModel => ({
    offer,
    provider: providerOf(offer.providerId),
    isLowest: offer.id === lowestOfferId,
  });

  const groups = groupByCategory(sortOffers(inScope, state.sort));
  const sections: OfferSection[] = groups
    .map((g) => ({
      category: g.category,
      label: CATEGORY_LABEL[g.category],
      kind: (state.category === "auto" && g.category !== focusCategory ? "alternative" : "primary") as
        | "primary"
        | "alternative",
      offers: g.offers.map(card),
    }))
    // Primary (focus) section first.
    .sort((a, b) => (a.category === focusCategory ? -1 : b.category === focusCategory ? 1 : 0));

  const primaryCount = sections.filter((s) => s.kind === "primary").reduce((n, s) => n + s.offers.length, 0);
  const alternativeCount = sections.filter((s) => s.kind === "alternative").reduce((n, s) => n + s.offers.length, 0);

  const glance: GlanceEntry[] = PROVIDERS.map((provider) => {
    const failed = failedProviders.find((f) => f.provider.id === provider.id);
    if (failed) return { kind: "unavailable", provider, status: failed.status };
    const best = focusOffers.find((o) => o.providerId === provider.id);
    return best ? { kind: "offer", provider, card: card(best) } : { kind: "no_comparable", provider };
  });

  const presentCategories = groupByCategory(byCancellation);
  const categoryOptions: ComparisonViewModel["categoryOptions"] = [
    {
      value: "auto",
      label: defaultCategory ? `Recommended (${CATEGORY_LABEL[defaultCategory]})` : "Recommended",
      // Only the directly comparable offers shown in the primary section.
      count: byCancellation.filter((o) => o.category === defaultCategory).length,
    },
    ...presentCategories.map((g) => ({ value: g.category as CategoryFilter, label: CATEGORY_LABEL[g.category], count: g.offers.length })),
    { value: "all", label: "All suitable vehicle types", count: byCancellation.length },
  ];
  if (specific && !presentCategories.some((g) => g.category === specific)) {
    categoryOptions.splice(1, 0, { value: specific, label: CATEGORY_LABEL[specific], count: 0 });
  }

  const cancellationScope = specific ? eligible.filter((o) => o.category === specific) : eligible;
  const cancellationOptions: ComparisonViewModel["cancellationOptions"] = (
    [
      ["all", "All policies"],
      ["free", "Free cancellation"],
      ["refundable", "Free or with fee"],
    ] as const
  ).map(([value, label]) => ({
    value,
    label,
    count: cancellationScope.filter((o) => matchesCancellation(o, value)).length,
  }));

  const visible = sections.reduce((n, s) => n + s.offers.length, 0);
  let empty: EmptyReason | null = null;
  if (completeness === "all_failed") empty = "all_failed";
  else if (!response.demoRoute && offers.length === 0) empty = "unsupported_route";
  else if (offers.length === 0) empty = "no_offers";
  else if (eligible.length === 0) empty = "capacity";
  else if (visible === 0) empty = "filters";

  return {
    request,
    pickup,
    dropoff,
    demoRoute: response.demoRoute,
    currency: response.demoRoute?.currency ?? null,
    state,
    completeness,
    failedProviders,
    respondedWithoutOffers,
    providerStatuses: results.map((r) => ({ provider: providerOf(r.providerId), status: r.status })),
    totalOffers: offers.length,
    eligibleCount: eligible.length,
    hiddenForCapacity: offers.length - eligible.length,
    defaultCategory,
    focusCategory,
    categoryOptions,
    cancellationOptions,
    glance,
    sections,
    primaryCount,
    alternativeCount,
    lowestOfferId,
    lowestWithheldForFees,
    empty,
  };
}

/** Helper for tests/consistency checks. */
export const lowestPrice = (a: NormalizedTransferOffer, b: NormalizedTransferOffer) =>
  compareMoney(a.price.quotedPrice, b.price.quotedPrice);
