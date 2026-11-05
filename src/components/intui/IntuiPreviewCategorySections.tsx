import { useState, type ComponentType } from "react";
import {
  BriefcaseBusiness, BusFront, CarFront,
  Check, ChevronDown, ChevronUp, Crown, Luggage, UsersRound,
} from "lucide-react";
import { describeCancellation } from "@/domain/cancellation";
import { formatMoney } from "@/domain/money";
import { CATEGORY_LABEL } from "@/domain/vehicle-taxonomy";
import type { NormalizedTransferOffer, VehicleCategory } from "@/domain/types";
import { isGroupLowestPrice, type IntuiPreviewGroup } from "@/search/intui-preview-groups";

const INITIAL_VISIBLE = 3;

type IconComponent = ComponentType<{ className?: string; size?: number; "aria-hidden"?: boolean }>;

interface CategoryAppearance {
  description: string;
  icon: IconComponent;
  header: string;
  iconBackground: string;
  iconColor: string;
  accent: string;
}

/**
 * Explicit semantic design tokens: muted, accessible category backgrounds
 * instead of unstructured rainbow badges or implying relative quality.
 */
const CATEGORY_APPEARANCE: Record<VehicleCategory, CategoryAppearance> = {
  economy_sedan: {
    description: "Entry-level private cars",
    icon: CarFront,
    header: "from-emerald-50 via-teal-50/80 to-white",
    iconBackground: "bg-emerald-100",
    iconColor: "text-emerald-800",
    accent: "bg-emerald-500",
  },
  standard_sedan: {
    description: "Everyday sedan transfers",
    icon: CarFront,
    header: "from-sky-50 via-blue-50/80 to-white",
    iconBackground: "bg-sky-100",
    iconColor: "text-sky-800",
    accent: "bg-sky-500",
  },
  comfort_sedan: {
    description: "Comfort-class sedan transfers",
    icon: CarFront,
    header: "from-indigo-50 via-blue-50/70 to-white",
    iconBackground: "bg-indigo-100",
    iconColor: "text-indigo-800",
    accent: "bg-indigo-500",
  },
  business_sedan: {
    description: "Business-class sedan transfers",
    icon: BriefcaseBusiness,
    header: "from-blue-50 via-indigo-50/70 to-white",
    iconBackground: "bg-blue-100",
    iconColor: "text-blue-800",
    accent: "bg-blue-600",
  },
  executive: {
    description: "Executive-class vehicle options",
    icon: Crown,
    header: "from-violet-50 via-purple-50/60 to-white",
    iconBackground: "bg-violet-100",
    iconColor: "text-violet-800",
    accent: "bg-violet-500",
  },
  minivan: {
    description: "Larger vehicles with group capacity",
    icon: UsersRound,
    header: "from-amber-50 via-orange-50/60 to-white",
    iconBackground: "bg-amber-100",
    iconColor: "text-amber-800",
    accent: "bg-amber-500",
  },
  minibus: {
    description: "Larger passenger group transfers",
    icon: BusFront,
    header: "from-cyan-50 via-teal-50/60 to-white",
    iconBackground: "bg-cyan-100",
    iconColor: "text-cyan-800",
    accent: "bg-cyan-600",
  },
  unclassified: {
    description: "Other identified vehicle options",
    icon: CarFront,
    header: "from-slate-100 via-slate-50 to-white",
    iconBackground: "bg-slate-200",
    iconColor: "text-slate-700",
    accent: "bg-slate-500",
  },
};

export interface IntuiPreviewCategorySectionsProps {
  groups: readonly IntuiPreviewGroup[];
  searchedLuggage: number;
  /** A new key on changed filters remounts sections in their collapsed state. */
  sort: "price_asc" | "price_desc";
}

export function IntuiPreviewCategorySections({
  groups, searchedLuggage, sort,
}: IntuiPreviewCategorySectionsProps) {
  if (!groups.length) return null;
  return (
    <div className="space-y-5">
      <nav aria-label="Jump to vehicle category" className="rounded-2xl border border-border bg-white/80 p-4 shadow-card">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Browse by vehicle type
        </p>
        <div className="flex flex-wrap gap-2">
          {groups.map((group) => (
            <a
              key={group.category}
              href={"#intui-category-" + group.category}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-slate-50 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {CATEGORY_LABEL[group.category]}
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                {group.offers.length}
              </span>
            </a>
          ))}
        </div>
      </nav>

      <div className="space-y-7">
        {groups.map((group) => (
          <IntuiCategorySection
            key={group.category}
            group={group}
            searchedLuggage={searchedLuggage}
            sort={sort}
          />
        ))}
      </div>
    </div>
  );
}

function IntuiCategorySection({
  group, searchedLuggage, sort,
}: {
  group: IntuiPreviewGroup;
  searchedLuggage: number;
  sort: "price_asc" | "price_desc";
}) {
  const [expanded, setExpanded] = useState(false);
  const appearance = CATEGORY_APPEARANCE[group.category];
  const Icon = appearance.icon;
  const visible = expanded ? group.offers : group.offers.slice(0, INITIAL_VISIBLE);
  const hidden = Math.max(0, group.offers.length - INITIAL_VISIBLE);
  const listId = "intui-offers-" + group.category;
  const titleId = "intui-category-title-" + group.category;

  return (
    <section
      id={"intui-category-" + group.category}
      aria-labelledby={titleId}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-white shadow-card"
    >
      <div className={"h-1.5 w-full " + appearance.accent} aria-hidden="true" />
      <div className={"flex flex-wrap items-center justify-between gap-4 border-b border-border bg-gradient-to-r p-5 sm:px-6 " + appearance.header}>
        <div className="flex min-w-0 items-center gap-3">
          <span className={"flex size-12 shrink-0 items-center justify-center rounded-2xl " + appearance.iconBackground + " " + appearance.iconColor}>
            <Icon className="size-6" aria-hidden={true} />
          </span>
          <div>
            <h2 id={titleId} className="font-display text-xl font-extrabold text-foreground">
              {CATEGORY_LABEL[group.category]}
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{appearance.description}</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">
              {group.offers.length} {group.offers.length === 1 ? "offer" : "offers"} in this category
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/85 px-4 py-2 text-left shadow-sm sm:text-right">
          <p className="text-xs font-medium text-muted-foreground">
            {group.lowest ? "From" : "Prices"}
          </p>
          {group.lowest ? (
            <p className="font-display text-xl font-extrabold tabular-nums text-foreground">
              {formatMoney(group.lowest.price.quotedPrice)}
            </p>
          ) : (
            <p className="text-sm font-bold text-foreground">Multiple currencies</p>
          )}
        </div>
      </div>

      <div id={listId} className="grid gap-3 bg-slate-50/65 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((offer) => (
          <IntuiOfferCard
            key={offer.id}
            offer={offer}
            isLowest={isGroupLowestPrice(offer, group.lowest)}
            searchedLuggage={searchedLuggage}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-white px-4 py-3 sm:px-5">
        <p className="text-xs text-muted-foreground">
          {visible.length} of {group.offers.length} shown
          <span className="mx-1.5">·</span>
          {sort === "price_asc" ? "Lower prices first" : "Higher prices first"}
        </p>
        {hidden > 0 && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={listId}
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-blue-50 px-3 py-2 text-sm font-bold text-primary transition-colors hover:border-primary/40 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {expanded ? (
              <>Show fewer <ChevronUp className="size-4" aria-hidden /></>
            ) : (
              <>Show {hidden} more <ChevronDown className="size-4" aria-hidden /></>
            )}
          </button>
        )}
      </div>
    </section>
  );
}

function IntuiOfferCard({
  offer, isLowest, searchedLuggage,
}: {
  offer: NormalizedTransferOffer;
  isLowest: boolean;
  searchedLuggage: number;
}) {
  const cancellation = describeCancellation(offer.cancellation);
  const extraBags = offer.maxLuggage >= searchedLuggage + 2;

  return (
    <article
      className={
        "flex h-full min-w-0 flex-col rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-card " +
        (isLowest ? "border-emerald-300 ring-1 ring-emerald-100" : "border-border")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Private transfer
          </p>
          <h3 className="mt-1 font-display text-base font-bold leading-snug text-foreground">
            {offer.providerVehicleLabel || CATEGORY_LABEL[offer.category]}
          </h3>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {isLowest && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900">
            <Check className="size-3.5" aria-hidden /> Lowest in category
          </span>
        )}
        {offer.cancellation.kind === "free_until" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2.5 py-1 text-xs font-semibold text-teal">
            Free cancellation
          </span>
        )}
        {offer.meetAndGreet === true && (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
            Meet &amp; greet
          </span>
        )}
        {extraBags && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
            <Luggage className="size-3" aria-hidden /> Extra bag capacity
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm">
        <div>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <UsersRound className="size-3.5" aria-hidden /> Passengers
          </span>
          <strong className="mt-0.5 block tabular-nums text-foreground">Up to {offer.maxPassengers}</strong>
        </div>
        <div>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Luggage className="size-3.5" aria-hidden /> Bags
          </span>
          <strong className="mt-0.5 block tabular-nums text-foreground">Up to {offer.maxLuggage}</strong>
        </div>
      </div>

      <div className="mt-auto pt-4">
        <div className="border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">Quoted transfer price</p>
          <p className="mt-0.5 font-display text-2xl font-extrabold tabular-nums tracking-tight text-foreground">
            {formatMoney(offer.price.quotedPrice)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Fees / extras not confirmed</p>
        </div>
        <p className="mt-3 border-t border-dashed border-border pt-3 text-xs text-muted-foreground">
          {cancellation.headline}
          {cancellation.tone === "positive" ? " · " + cancellation.detail : ""}
        </p>
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          Read-only quote · Booking not yet available
        </p>
      </div>
    </article>
  );
}
