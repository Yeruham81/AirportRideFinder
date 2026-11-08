import { CarFront, UsersRound, Luggage } from "lucide-react";
import { formatMoney } from "@/domain/money";
import type { TransferisePreviewOffer } from "@/providers/transferise/preview";

export function TransferisePreviewResults({ offers, bookingUrl }: {
  offers: TransferisePreviewOffer[]; bookingUrl: string | null;
}) {
  // Server validation guarantees a single requested currency; never rank across currencies.
  const sorted = [...offers].sort((a, b) => a.price.minor - b.price.minor || a.name.localeCompare(b.name));
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-extrabold">{sorted.length} vehicle options</h2>
      <div className="space-y-3">
        {sorted.map((offer) => (
          <article key={offer.id} className="rounded-xl border bg-card p-4 shadow-card sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-900">
                  <CarFront className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="font-display font-bold">{offer.name}</h3>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <UsersRound className="size-4" aria-hidden /> Up to {offer.maxPassengers} passengers
                    {offer.maxLuggage !== null && <><Luggage className="size-4" aria-hidden /> {offer.maxLuggage} bags</>}
                  </p>
                </div>
              </div>
              <div className="sm:text-right">
                <p className="font-display text-3xl font-extrabold tabular-nums">{formatMoney(offer.price)}</p>
                <p className="text-xs text-muted-foreground">{offer.price.currency} · total per vehicle · one way</p>
              </div>
            </div>
          </article>
        ))}
      </div>
      {bookingUrl ? (
        <div className="space-y-2 rounded-xl border bg-card p-4">
          <a href={bookingUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
            className="inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">
            Open sandbox booking page
          </a>
          <p className="text-xs text-muted-foreground">
            Opens the route's test page on Transferise. Choose a vehicle there; this link does not reserve
            a selected vehicle. Attribution parameters are kept exactly as returned by the API.
          </p>
        </div>
      ) : (
        <p role="status" className="text-sm text-muted-foreground">
          No verified sandbox booking link was returned. Prices can be inspected, but checkout is disabled.
        </p>
      )}
    </div>
  );
}
