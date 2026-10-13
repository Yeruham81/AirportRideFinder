import { ArrowUpRight, Briefcase, Car, Check, CircleHelp, Clock, Handshake, Info, Users, X } from "lucide-react";
import { describeCancellation, type CancellationTone } from "@/domain/cancellation";
import { formatMoney } from "@/domain/money";
import { CATEGORY_LABEL } from "@/domain/vehicle-taxonomy";
import { cn } from "@/lib/utils";
import type { OfferCardModel } from "@/search/view-model";
import { COPY } from "@/content/strings";
import { feeLabel, priceLabel } from "./format";
import { ProviderMark, providerTextClass } from "./ProviderMark";

const TONE: Record<CancellationTone, { cls: string; Icon: typeof Check }> = {
  positive: { cls: "text-success", Icon: Check },
  neutral: { cls: "text-warning-foreground", Icon: Info },
  negative: { cls: "text-muted-foreground", Icon: X },
  unknown: { cls: "text-muted-foreground", Icon: CircleHelp },
};

export function OfferCard({ model, onViewDeal }: { model: OfferCardModel; onViewDeal: (m: OfferCardModel) => void }) {
  const { offer, provider, isLowest } = model;
  const c = describeCancellation(offer.cancellation);
  const tone = TONE[c.tone];
  const price = formatMoney(offer.price.quotedPrice);

  return (
    <article
      aria-label={`${provider.displayName}, ${CATEGORY_LABEL[offer.category]}, ${price}`}
      data-testid="offer-card"
      data-provider={provider.id}
      data-price-minor={offer.price.quotedPrice.minor}
      className={cn(
        "relative rounded-xl border bg-card shadow-card transition hover:border-primary/40",
        isLowest && "border-teal/60 ring-1 ring-teal/30",
      )}
    >
      {isLowest && (
        <span className="absolute -top-px left-4 rounded-b-md bg-teal px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-on-brand">
          Lowest sample price
        </span>
      )}
      <div className={cn("grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_auto] md:items-center md:gap-5 md:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_auto]", isLowest && "pt-7 md:pt-6")}>
        {/* Provider + vehicle (+ mobile price) */}
        <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <ProviderMark provider={provider} />
            <div className="min-w-0">
              <h3 className={cn("truncate font-display text-base font-bold", providerTextClass(provider))}>{provider.displayName}</h3>
              <p className="text-xs text-muted-foreground">Fictional provider</p>
            </div>
          </div>
          <div className="text-right md:hidden">
            <p className="font-display text-2xl font-extrabold text-foreground">{price}</p>
            <p className="text-[11px] text-muted-foreground">{priceLabel(offer.price.taxesAndFees)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 md:pl-12">
          <Car className="size-5 shrink-0 text-primary/70" aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{CATEGORY_LABEL[offer.category]}</p>
            <p className="text-xs text-muted-foreground">Listed as “{offer.providerVehicleLabel}”</p>
          </div>
        </div>
        </div>

        {/* Capacity + cancellation: stacked on medium widths, side by side on wide screens */}
        <div className="flex min-w-0 flex-col gap-3 xl:grid xl:grid-cols-[auto_minmax(0,1fr)] xl:items-center xl:gap-6">
        <ul className="grid grid-cols-2 gap-1 text-sm text-foreground md:grid-cols-1">
          <li className="flex items-center gap-2"><Users className="size-4 text-muted-foreground" aria-hidden /><span className="whitespace-nowrap">Up to {offer.maxPassengers} people</span></li>
          <li className="flex items-center gap-2"><Briefcase className="size-4 text-muted-foreground" aria-hidden /><span className="whitespace-nowrap">Up to {offer.maxLuggage} bags</span></li>
        </ul>

        {/* Cancellation + extras */}
        <div className="text-sm">
          <p className={cn("flex items-center gap-1.5 font-semibold", tone.cls)}>
            <tone.Icon className="size-4" aria-hidden /> {c.headline}
          </p>
          <p className="text-xs text-muted-foreground">{c.detail}</p>
          {(offer.meetAndGreet || offer.waitingTimeMins !== null) && (
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {offer.meetAndGreet && <span className="inline-flex items-center gap-1"><Handshake className="size-3.5" aria-hidden />Meet & greet</span>}
              {offer.waitingTimeMins !== null && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{offer.waitingTimeMins} min free waiting</span>}
            </p>
          )}
        </div>
        </div>

        {/* Price + action */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <div className="hidden text-right md:block">
            <p className="font-display text-[28px] font-extrabold leading-none text-foreground">{price}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{priceLabel(offer.price.taxesAndFees)}</p>
            <p data-testid="card-fee" className={cn("text-[11px]", offer.price.taxesAndFees === "included" ? "text-muted-foreground" : "font-medium text-warning-foreground")}>{feeLabel(offer.price.taxesAndFees)}</p>
          </div>
          <p className={cn("text-xs md:hidden", offer.price.taxesAndFees === "included" ? "text-muted-foreground" : "font-medium text-warning-foreground")}>{feeLabel(offer.price.taxesAndFees)}</p>
          <div className="flex flex-col items-stretch gap-1 md:items-center">
            <button
              type="button"
              onClick={() => onViewDeal(model)}
              className="inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              View provider offer <ArrowUpRight className="size-4" aria-hidden />
              <span className="sr-only"> from {provider.displayName}</span>
            </button>
            <span className="text-center text-[11px] text-muted-foreground md:whitespace-nowrap">{COPY.bookingElsewhere}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
