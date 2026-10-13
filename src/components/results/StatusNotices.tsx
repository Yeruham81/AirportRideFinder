import { Link } from "@tanstack/react-router";
import { AlertTriangle, Info, RotateCw, SearchX } from "lucide-react";
import { DEMO_ROUTES, getLocation } from "@/data/locations";
import { defaultPickupDate } from "@/domain/time";
import type { ComparisonViewModel } from "@/search/view-model";
import { plural } from "./format";

/** Warning only for real failures (error/timeout). Empty replies get a neutral note. */
export function ProviderStatusNotice({ vm }: { vm: ComparisonViewModel }) {
  return (
    <div className="space-y-2">
      {vm.completeness === "partial" && (
        <div role="alert" data-testid="partial-warning" className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning-soft px-3.5 py-2.5 text-sm text-warning-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong className="font-semibold">Results may be incomplete:</strong>{" "}
            {vm.failedProviders.map((f) => `${f.provider.displayName} ${f.status === "timeout" ? "timed out" : "did not respond"}`).join(", ")}.
            Offers from other providers are shown.
          </p>
        </div>
      )}
      {vm.respondedWithoutOffers.length > 0 && vm.completeness !== "all_failed" && (
        <p data-testid="no-offers-note" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden />
          {vm.respondedWithoutOffers.map((p) => p.displayName).join(", ")} responded with no offers for this route.
        </p>
      )}
      {vm.hiddenForCapacity > 0 && (
        <p data-testid="capacity-note" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" aria-hidden />
          {plural(vm.hiddenForCapacity, "offer", "offers")} hidden: not enough room for {plural(vm.request.passengers, "passenger", "passengers")} and {plural(vm.request.luggage, "bag", "bags")}.
        </p>
      )}
    </div>
  );
}

export function DemoRouteLinks() {
  return (
    <ul className="mt-4 flex flex-wrap justify-center gap-2">
      {DEMO_ROUTES.map((r) => (
        <li key={r.label}>
          <Link
            to="/search"
            search={{ from: r.pickupId, to: r.dropoffId, date: defaultPickupDate(getLocation(r.pickupId)!.timeZone), time: "10:00", pax: 2, bags: 2 }}
            className="inline-flex h-10 items-center rounded-full border bg-surface px-4 text-sm font-medium text-primary hover:bg-accent"
          >
            {r.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ vm, onReset, onRetry }: { vm: ComparisonViewModel; onReset: () => void; onRetry: () => void }) {
  const content = (() => {
    switch (vm.empty) {
      case "all_failed":
        return { title: "Providers did not respond", body: "None of the providers returned results. Please try again.", action: <ActionButton onClick={onRetry}><RotateCw className="size-4" aria-hidden /> Try again</ActionButton> };
      case "unsupported_route":
        return { title: "This route isn't in the demonstration yet", body: `No sample offers exist for ${vm.pickup.shortName} → ${vm.dropoff.shortName}. Try one of the demonstration routes:`, action: <DemoRouteLinks /> };
      case "no_offers":
        return { title: "No offers for this route", body: "Providers responded, but none offered this journey.", action: <DemoRouteLinks /> };
      case "capacity":
        return { title: "No vehicle fits this group", body: `None of the ${plural(vm.totalOffers, "offer", "offers")} can carry ${plural(vm.request.passengers, "passenger", "passengers")} with ${plural(vm.request.luggage, "bag", "bags")}. Try fewer bags or passengers.`, action: null };
      case "filters":
        return { title: "No offers match your filters", body: "Suitable offers exist, but your current filters hide them.", action: <ActionButton onClick={onReset}>Reset filters</ActionButton> };
      default:
        return null;
    }
  })();
  if (!content) return null;
  return (
    <div data-testid="empty-state" data-reason={vm.empty} className="rounded-xl border border-dashed bg-card px-6 py-10 text-center">
      <SearchX className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <h3 className="mt-3 font-display text-lg font-bold text-foreground">{content.title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{content.body}</p>
      {content.action && <div className="mt-4 flex justify-center">{content.action}</div>}
    </div>
  );
}

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
      {children}
    </button>
  );
}
