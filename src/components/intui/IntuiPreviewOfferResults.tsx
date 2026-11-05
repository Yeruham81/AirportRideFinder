import { useMemo, useState } from "react";
import { CATEGORY_LABEL, CATEGORY_ORDER } from "@/domain/vehicle-taxonomy";
import type { NormalizedTransferOffer, VehicleCategory } from "@/domain/types";
import { groupIntuiPreviewOffers } from "@/search/intui-preview-groups";
import { IntuiPreviewCategorySections } from "./IntuiPreviewCategorySections";
import {
  parsePreviewPrice,
  selectIntuiPreviewOffers,
  type IntuiPreviewSort,
} from "@/search/intui-preview-filters";

interface PreviewOffersProps {
  offers: readonly NormalizedTransferOffer[];
  searchedPassengers: number;
  searchedLuggage: number;
}

/**
 * Client-only controls: each filter reads the SAME already-fetched result set.
 * The user must perform a new route search to change the original request.
 */
export function IntuiPreviewOfferResults({
  offers, searchedPassengers, searchedLuggage,
}: PreviewOffersProps) {
  const [category, setCategory] = useState<VehicleCategory | "all">("all");
  const [passengers, setPassengers] = useState(searchedPassengers);
  const [luggage, setLuggage] = useState(searchedLuggage);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<IntuiPreviewSort>("price_asc");

  const categories = useMemo(() =>
    CATEGORY_ORDER.filter((item) => offers.some((offer) => offer.category === item)),
  [offers]);
  const maxPassengers = Math.max(searchedPassengers, ...offers.map((offer) => offer.maxPassengers));
  const maxLuggage = Math.max(searchedLuggage, ...offers.map((offer) => offer.maxLuggage));
  const seatChoices = Array.from(
    { length: maxPassengers - searchedPassengers + 1 },
    (_, index) => searchedPassengers + index,
  );
  const bagChoices = Array.from(
    { length: maxLuggage - searchedLuggage + 1 },
    (_, index) => searchedLuggage + index,
  );

  const currency = offers[0]?.price.quotedPrice.currency ?? "USD";
  const minPriceMinor = parsePreviewPrice(minPrice, currency);
  const maxPriceMinor = parsePreviewPrice(maxPrice, currency);
  const invalidPrice = minPriceMinor === undefined || maxPriceMinor === undefined ||
    (minPriceMinor !== null && maxPriceMinor !== null &&
      minPriceMinor !== undefined && maxPriceMinor !== undefined &&
      minPriceMinor > maxPriceMinor);

  const filtered = useMemo(() => invalidPrice ? [] : selectIntuiPreviewOffers(offers, {
    category, passengers, luggage,
    minPriceMinor: minPriceMinor ?? null,
    maxPriceMinor: maxPriceMinor ?? null,
    sort,
  }), [offers, invalidPrice, category, passengers, luggage, minPriceMinor, maxPriceMinor, sort]);

  const groups = useMemo(() => groupIntuiPreviewOffers(filtered), [filtered]);
  // Reset an expanded category after the user changes any filter or sort,
  // so a new selection shows at most three cards in each category.
  const groupViewKey = [
    category, passengers, luggage, minPrice, maxPrice, sort,
  ].join("|");

  function clearFilters() {
    setCategory("all");
    setPassengers(searchedPassengers);
    setLuggage(searchedLuggage);
    setMinPrice("");
    setMaxPrice("");
    setSort("price_asc");
  }

  const fieldStyle = "mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

  return (
    <div className="space-y-6">
      <section aria-labelledby="intui-filter-heading" className="rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-white to-sky-50/70 p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="intui-filter-heading" className="font-display text-lg font-bold">Filter transfer offers</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Filters apply to these live quotes only — no additional provider requests.
            </p>
          </div>
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border border-input px-3 py-2 text-sm font-medium text-primary hover:bg-accent"
          >
            Clear filters
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block text-sm font-medium">
            Vehicle category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as VehicleCategory | "all")}
              className={fieldStyle}
            >
              <option value="all">All vehicle categories</option>
              {categories.map((item) => (
                <option value={item} key={item}>{CATEGORY_LABEL[item]}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Minimum passenger capacity
            <select
              value={passengers}
              onChange={(event) => setPassengers(Number(event.target.value))}
              className={fieldStyle}
            >
              {seatChoices.map((count) => (
                <option key={count} value={count}>{count} {count === 1 ? "passenger" : "passengers"}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Minimum luggage capacity
            <select
              value={luggage}
              onChange={(event) => setLuggage(Number(event.target.value))}
              className={fieldStyle}
            >
              {bagChoices.map((count) => (
                <option key={count} value={count}>{count} {count === 1 ? "bag" : "bags"}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Minimum price ({currency})
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={minPrice}
              onChange={(event) => setMinPrice(event.target.value)}
              aria-invalid={minPriceMinor === undefined || (minPriceMinor !== null &&
                maxPriceMinor !== null && maxPriceMinor !== undefined &&
                minPriceMinor !== undefined && minPriceMinor > maxPriceMinor)}
              placeholder="No minimum"
              className={fieldStyle}
            />
          </label>
          <label className="block text-sm font-medium">
            Maximum price ({currency})
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={maxPrice}
              onChange={(event) => setMaxPrice(event.target.value)}
              aria-invalid={maxPriceMinor === undefined || (minPriceMinor !== null &&
                maxPriceMinor !== null && minPriceMinor !== undefined &&
                maxPriceMinor !== undefined && minPriceMinor > maxPriceMinor)}
              placeholder="No maximum"
              className={fieldStyle}
            />
          </label>
          <label className="block text-sm font-medium">
            Sort by
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as IntuiPreviewSort)}
              className={fieldStyle}
            >
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </label>
        </div>
        {invalidPrice && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Enter valid non-negative prices (up to two decimals) and make sure the minimum is not above the maximum.
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white px-4 py-3 shadow-sm" aria-live="polite">
        <p className="text-sm font-semibold">
          {invalidPrice ? "Invalid price filter" : `${filtered.length} of ${offers.length} transfer offers`}
        </p>
        <p className="text-xs text-muted-foreground">
          {sort === "price_asc" ? "Lowest price first" : "Highest price first"} · {currency}
        </p>
      </div>

      {!invalidPrice && filtered.length === 0 && (
        <div role="status" className="rounded-xl border bg-card p-6 text-sm">
          No offers match these filters. Adjust the capacity, category or price range,
          or select <strong>Clear filters</strong> to see all available quotes.
        </div>
      )}

      {!invalidPrice && groups.length > 0 && (
        <IntuiPreviewCategorySections
          key={groupViewKey}
          groups={groups}
          searchedLuggage={searchedLuggage}
          sort={sort}
        />
      )}
    </div>
  );
}
