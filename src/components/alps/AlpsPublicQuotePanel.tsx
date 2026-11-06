import { useState, type FormEvent } from "react";
import { CarFront, Luggage, UsersRound, Wifi } from "lucide-react";
import { formatMoney } from "@/domain/money";
import {
  fetchAlpsPublicQuote, type AlpsPublicQuoteResult,
} from "@/providers/alps2alps/public-quote";

export function AlpsPublicQuotePanel({
  date, time, passengers,
}: {
  date: string; time: string; passengers: number;
}) {
  const [luggage, setLuggage] = useState(2);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AlpsPublicQuoteResult | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await fetchAlpsPublicQuote({ date, time, passengers, luggage }));
    } catch {
      setResult({ status: "network_error" });
    } finally { setBusy(false); }
  }

  const failureText: Partial<Record<AlpsPublicQuoteResult["status"], string>> = {
    invalid: "Choose a valid future Geneva-local pickup date/time, 1–16 adults and 0–8 suitcases.",
    timeout: "The public quote request timed out. No reservation was attempted.",
    network_error: "The browser could not complete this public, keyless quote request. Check browser connectivity or CORS restrictions.",
    rate_limited: "The public API rate limit was reached. Do not repeatedly retry.",
    malformed_response: "The returned public quote did not match our expected route, pickup time or price schema.",
    route_unavailable: "The provider reports that this route is unavailable for the selected search.",
  };

  return (
    <section aria-labelledby="alps-public-title" className="rounded-xl border border-teal/30 bg-card p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Wifi className="size-5 text-teal" aria-hidden />
        <h2 id="alps-public-title" className="font-display text-lg font-extrabold">
          Alternative: Public API — direct browser diagnostic
        </h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        The public, stateless GET quote endpoint is documented as browser-callable
        without authentication. This diagnostic bypasses the hosted B2B token request.
        It fetches actual public quote prices privately, without storing them or
        offering booking links. No promo code or affiliate tracking is applied.
      </p>
      <p className="mt-2 text-xs font-medium text-muted-foreground">
        Geneva Airport → Chamonix · {date} at {time} local pickup · {passengers} adults · EUR.
        The quote assumes no ski bags.
      </p>
      <form onSubmit={(event) => void onSubmit(event)} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="block text-sm font-semibold">
          Suitcases
          <select
            value={luggage}
            onChange={(event) => { setLuggage(Number(event.target.value)); setResult(null); }}
            className="mt-1 h-10 min-w-32 rounded-lg border border-input bg-background px-3 text-sm"
          >
            {Array.from({ length: 9 }, (_, i) => i).map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy}
          className="rounded-lg bg-teal px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? "Testing public API…" : "Test public quote (no key)"}
        </button>
      </form>
      {result?.status === "ok" && (
        <div className="mt-5 space-y-3">
          <div role="status" className="rounded-lg border border-teal/20 bg-teal-soft/40 p-4 text-sm">
            <strong>Public quote API connection successful.</strong> {result.offers.length}{" "}
            live public {result.offers.length === 1 ? "price" : "prices"} returned
            for pickup {result.pickupTime} (local). The provider confirmed{" "}
            {result.luggage} suitcases and {result.skiBags} ski bags.
            No booking was created.
          </div>
          <p className="text-xs text-muted-foreground">
            Private technical test only. Price comparison permission, production
            integration and commission attribution remain unconfirmed.
            Quotes may change before checkout.
          </p>
          <div className="space-y-3">
            {result.offers.map(offer => (
              <article key={offer.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <CarFront className="mt-1 size-6 text-teal" aria-hidden />
                    <div>
                      <h3 className="font-semibold">{offer.vehicleLabel}</h3>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <UsersRound className="size-4" aria-hidden />
                          {offer.maxPassengers ?? "Unconfirmed"} passenger capacity
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Luggage className="size-4" aria-hidden />
                          {offer.maxLuggage ?? "Unconfirmed"} suitcase capacity
                        </span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="font-display text-2xl font-extrabold tabular-nums">
                      {formatMoney(offer.price)}
                    </p>
                    <p className="text-xs text-muted-foreground">Public live quote · Not bookable here</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {result && result.status !== "ok" && (
        <div role="alert" className="mt-4 rounded-lg border bg-muted/30 p-4 text-sm">
          Public quote diagnostic: <code>{result.status}</code>.
          {" "}{result.status === "http_error"
            ? `Provider returned HTTP ${result.httpStatus} without usable quotes.`
            : failureText[result.status]}
          <p className="mt-1 text-xs text-muted-foreground">
            No credentials, private data or provider payloads are shown.
          </p>
        </div>
      )}
    </section>
  );
}
