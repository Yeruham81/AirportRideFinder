import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ViewDealDialog } from "@/components/deal/ViewDealDialog";
import { COPY } from "@/content/strings";
import { formatLocalDate } from "@/domain/time";
import { CATEGORY_LABEL } from "@/domain/vehicle-taxonomy";
import type { CancellationFilter, CategoryFilter, SortOrder } from "@/search/compare";
import type { ComparisonViewModel, OfferCardModel } from "@/search/view-model";
import { AtAGlanceStrip } from "./AtAGlanceStrip";
import { FilterPanel } from "./FilterPanel";
import { plural } from "./format";
import { OfferCard } from "./OfferCard";
import { EmptyState, ProviderStatusNotice } from "./StatusNotices";

export interface ResultsHandlers {
  onCategory: (c: CategoryFilter) => void;
  onCancellation: (c: CancellationFilter) => void;
  onSort: (s: SortOrder) => void;
  onReset: () => void;
  onRetry: () => void;
}

export function ResultsView({ vm, handlers }: { vm: ComparisonViewModel; handlers: ResultsHandlers }) {
  const [deal, setDeal] = useState<OfferCardModel | null>(null);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const r = vm.request;

  const primary = vm.sections.filter((s) => s.kind === "primary");
  const alternatives = vm.sections.filter((s) => s.kind === "alternative");
  const showGroupHeadings = primary.length > 1;

  const sortSelect = (
    <div className="relative">
      <label htmlFor="sort" className="sr-only">Sort offers</label>
      <select
        id="sort"
        value={vm.state.sort}
        onChange={(e) => handlers.onSort(e.target.value as SortOrder)}
        className="h-11 appearance-none rounded-lg border border-input bg-surface pl-3 pr-9 text-sm text-foreground outline-none focus:border-primary"
      >
        <option value="price_asc">Sort: Price (lowest first)</option>
        <option value="price_desc">Sort: Price (highest first)</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </div>
  );

  const filterProps = { vm, onCategory: handlers.onCategory, onCancellation: handlers.onCancellation, onReset: handlers.onReset };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">Compare prices for your airport transfer</h1>
          <p className="mt-1 text-sm text-muted-foreground" data-testid="search-summary">
            {vm.pickup.shortName} → {vm.dropoff.shortName}
            <span aria-hidden> · </span>{formatLocalDate(r.localDate)}, {r.localTime} local time
            <span aria-hidden> · </span>{plural(r.passengers, "passenger", "passengers")}
            <span aria-hidden> · </span>{plural(r.luggage, "bag", "bags")}
            {vm.currency && <><span aria-hidden> · </span>Prices in {vm.currency} (sample)</>}
          </p>
          {vm.demoRoute && <p className="mt-1 text-xs text-muted-foreground">{COPY.samplePriceNote}</p>}
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-teal/30 bg-teal-soft px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-teal">
          <span className="size-2 rounded-full bg-teal" aria-hidden /> Sample results
        </span>
      </div>

      <ProviderStatusNotice vm={vm} />

      {!vm.empty && <AtAGlanceStrip vm={vm} />}

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block" aria-label="Refine your comparison">
          <div className="sticky top-24 rounded-xl border bg-card p-5 shadow-card">
            <h2 className="mb-4 font-display text-lg font-bold">Refine your comparison</h2>
            <FilterPanel {...filterProps} />
          </div>
        </aside>

        <section aria-labelledby="offers-heading" className="min-w-0 space-y-3">
          <div className="sticky top-16 z-20 -mx-4 flex items-center justify-between gap-3 border-b bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-lg sm:border-0 sm:px-0 lg:static lg:bg-transparent lg:py-0">
            <h2 id="offers-heading" className="font-display text-base font-bold sm:text-lg" data-testid="offers-count">
              {plural(vm.primaryCount, "comparable provider offer", "comparable provider offers")}
            </h2>
            <div className="flex items-center gap-2">
              <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                <SheetTrigger asChild>
                  <button type="button" className="inline-flex h-11 items-center gap-2 rounded-lg border border-input bg-surface px-3 text-sm font-semibold text-primary lg:hidden">
                    <SlidersHorizontal className="size-4" aria-hidden /> Filters
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
                  <SheetHeader className="px-0"><SheetTitle>Refine your comparison</SheetTitle></SheetHeader>
                  <FilterPanel {...filterProps} />
                  <button type="button" onClick={() => setSheetOpen(false)} className="mt-4 h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
                    Show {plural(vm.primaryCount, "offer", "offers")}
                  </button>
                </SheetContent>
              </Sheet>
              {sortSelect}
            </div>
          </div>

          {vm.empty ? (
            <EmptyState vm={vm} onReset={handlers.onReset} onRetry={handlers.onRetry} />
          ) : (
            <>
              {primary.map((s) => (
                <div key={s.category} className="space-y-3" data-testid="offer-section" data-category={s.category}>
                  {showGroupHeadings && <h3 className="pt-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">{s.label}</h3>}
                  {s.offers.map((m) => <OfferCard key={m.offer.id} model={m} onViewDeal={setDeal} />)}
                </div>
              ))}
              {primary.length === 0 && vm.focusCategory && (
                <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
                  No {CATEGORY_LABEL[vm.focusCategory].toLowerCase()} offers match your filters. Other vehicle types are listed below.
                </p>
              )}
              {alternatives.length > 0 && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAlternatives((v) => !v)}
                    aria-expanded={showAlternatives}
                    className="flex h-11 w-full items-center justify-between rounded-lg border bg-card px-4 text-sm font-semibold text-foreground shadow-card hover:bg-accent"
                  >
                    Other suitable vehicle types ({vm.alternativeCount})
                    <ChevronDown className={`size-4 transition ${showAlternatives ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {showAlternatives && (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs text-muted-foreground">These are different vehicle classes and are not directly comparable with the offers above.</p>
                      {alternatives.map((s) => (
                        <div key={s.category} className="space-y-3" data-testid="offer-section" data-category={s.category}>
                          <h3 className="pt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{s.label}</h3>
                          {s.offers.map((m) => <OfferCard key={m.offer.id} model={m} onViewDeal={setDeal} />)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <ViewDealDialog model={deal} onClose={() => setDeal(null)} />
    </div>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <p className="text-sm text-muted-foreground">Comparing providers…</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
      </div>
      {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />)}
    </div>
  );
}
