import { AlertTriangle } from "lucide-react";
import { formatMoney } from "@/domain/money";
import { CATEGORY_LABEL } from "@/domain/vehicle-taxonomy";
import { cn } from "@/lib/utils";
import type { ComparisonViewModel } from "@/search/view-model";
import { providerTextClass } from "./ProviderMark";
import { shortFeeLabel } from "./format";

export function AtAGlanceStrip({ vm }: { vm: ComparisonViewModel }) {
  if (!vm.focusCategory) return null;
  return (
    <section aria-labelledby="glance-heading">
      <h2 id="glance-heading" className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
        At a glance — same route & {CATEGORY_LABEL[vm.focusCategory].toLowerCase()} class
      </h2>
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {vm.glance.map((g) => (
          <li
            key={g.provider.id}
            data-testid="glance-entry"
            data-provider={g.provider.id}
            data-kind={g.kind}
            data-price-minor={g.kind === "offer" ? g.card.offer.price.quotedPrice.minor : undefined}
            className={cn(
              "rounded-xl border bg-card p-3 shadow-card sm:p-4",
              g.kind === "offer" && g.card.isLowest && "border-teal/60 bg-teal-soft/40 ring-1 ring-teal/30",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-1">
              <p className={cn("font-display text-sm font-bold sm:text-base", providerTextClass(g.provider))}>{g.provider.displayName}</p>
              {g.kind === "offer" && g.card.isLowest && (
                <span className="rounded-md bg-success-soft px-1.5 py-0.5 text-[10px] font-bold text-success sm:text-[11px]">Lowest sample price</span>
              )}
            </div>
            {g.kind === "offer" && (
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                <span className="font-display text-2xl font-extrabold text-foreground sm:text-3xl">{formatMoney(g.card.offer.price.quotedPrice)}</span>
                <span className="text-xs text-muted-foreground">{CATEGORY_LABEL[g.card.offer.category]}</span>
              </p>
            )}
            {g.kind === "offer" && (
              <p
                data-testid="glance-fee"
                className={cn(
                  "mt-1 text-[11px] font-medium",
                  g.card.offer.price.taxesAndFees === "included" ? "text-muted-foreground" : "text-warning-foreground",
                )}
              >
                {shortFeeLabel(g.card.offer.price.taxesAndFees)}
              </p>
            )}
            {g.kind === "no_comparable" && (
              <p className="mt-2 text-xs text-muted-foreground">No comparable offer for this route</p>
            )}
            {g.kind === "unavailable" && (
              <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning-foreground">
                <AlertTriangle className="size-3.5" aria-hidden /> Unavailable — did not respond
              </p>
            )}
          </li>
        ))}
      </ul>
      {vm.lowestWithheldForFees && (
        <p data-testid="lowest-withheld" className="mt-2 text-xs text-muted-foreground">
          No lowest-price label shown: the cheapest sample price does not confirm that taxes and fees are included.
        </p>
      )}
    </section>
  );
}
