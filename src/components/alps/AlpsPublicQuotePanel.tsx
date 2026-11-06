import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeftRight, CarFront, Luggage, UsersRound, Wifi } from "lucide-react";
import { formatMoney } from "@/domain/money";
import { AlpsLocationAutocomplete } from "./AlpsLocationAutocomplete";
import { defaultPickupDate, todayInTimeZone } from "@/domain/time";
import {
  ALPS_INITIAL_FROM, ALPS_INITIAL_TO,
  alpsCatalogAllowsPair, fetchAlpsRouteCatalog, fetchAlpsPublicQuote,
  validateAlpsPublicQuery,
  type AlpsRouteCatalogResult,
  type AlpsPublicCurrency,
  type AlpsPublicLocation,
  type AlpsPublicQuoteQuery,
  type AlpsPublicQuoteResult,
  type AlpsQuoteMismatchField,
} from "@/providers/alps2alps/public-quote";

const inputClass = "mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground";
const quoteError: Record<string, string> = {
  invalid: "Select two distinct provider locations, a future pickup and valid party / baggage counts.",
  timeout: "The live quote request timed out.",
  network_error: "Could not reach the public quote API from this browser.",
  rate_limited: "Rate limit reached. Avoid repeated quote requests.",
  malformed_response: "Provider quote structure could not be validated. No unverified prices are displayed.",
  quote_mismatch: "The provider confirmed different trip details. No price is shown until the search matches.",
  no_offers: "No requested-time vehicles fit this search.",
  route_unavailable: "The provider does not currently support this pickup / destination combination.",
  http_error: "The provider returned an HTTP error. No quote was accepted.",
};

const mismatchFields: Record<AlpsQuoteMismatchField, string> = {
  route: "The provider returned a different pickup/destination code.",
  currency: "The provider returned a different currency.",
  passengers: "The provider returned a different adult count.",
  pickup_time: "The provider returned a different pickup time.",
  suitcases: "The provider quoted a different suitcase count.",
  ski_bags: "The provider did not quote the requested ski/snowboard bag count. The supplier ignores ski bags for summer journeys.",
};

export function AlpsPublicQuotePanel() {
  const [catalog, setCatalog] = useState<AlpsRouteCatalogResult | null>(null);
  useEffect(() => {
    let active = true;
    // One public, keyless GET loads the active station/resort directory once
    // per private-page mount. Typing never triggers a quote or booking.
    void fetchAlpsRouteCatalog().then(value => {
      if (active) setCatalog(value);
    }).catch(() => {
      if (active) setCatalog({ status: "network_error" });
    });
    return () => { active = false; };
  }, []);

  const [from, setFrom] = useState<AlpsPublicLocation | null>(ALPS_INITIAL_FROM);
  const [to, setTo] = useState<AlpsPublicLocation | null>(ALPS_INITIAL_TO);
  const [date, setDate] = useState(() => defaultPickupDate("Europe/Zurich"));
  const [time, setTime] = useState("14:00");
  const [passengers, setPassengers] = useState(2);
  const [luggage, setLuggage] = useState(2);
  const [skiBags, setSkiBags] = useState(0);
  const [currency, setCurrency] = useState<AlpsPublicCurrency>("EUR");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AlpsPublicQuoteResult | null>(null);
  const [completed, setCompleted] = useState<AlpsPublicQuoteQuery | null>(null);
  const sequence = useRef(0);
  // Swapping recreates location-picker inputs from their corresponding selected location.
  const [swapId, setSwapId] = useState(0);

  function invalidate() {
    sequence.current++;
    setResult(null);
    setCompleted(null);
  }
  function updateFrom(next: AlpsPublicLocation | null) {
    invalidate();
    setFrom(next);
    // When the user chooses a new origin, clear any previous destination
    // that is not paired with it. This permits changing routes in one flow.
    if (next && to && catalog?.status === "ok" &&
      !alpsCatalogAllowsPair(catalog.catalog, next.code, to.code)) {
      setTo(null);
      setSwapId(v => v + 1);
    }
  }
  function updateTo(next: AlpsPublicLocation | null) { invalidate(); setTo(next); }

  function swap() {
    invalidate();
    setFrom(to);
    setTo(from);
    setSwapId(v => v + 1);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !from || !to) return;
    const query: AlpsPublicQuoteQuery = {
      from: from.code, to: to.code, date, time, passengers, luggage, skiBags, currency,
    };
    if (!validateAlpsPublicQuery(query)) {
      setResult({ status: "invalid" });
      return;
    }
    const request = ++sequence.current;
    setBusy(true);
    setResult(null);
    setCompleted(null);
    try {
      const answer = await fetchAlpsPublicQuote(query);
      if (request === sequence.current) {
        if (answer.status === "ok" && answer.bagAdjustment) {
          // Display the original supplier response immediately: no second GET,
          // and never label a zero-ski-bag price as including the user's bags.
          setSkiBags(0);
          setCompleted({ ...query, skiBags: 0 });
        } else {
          setCompleted(query);
        }
        setResult(answer);
      }
    } catch {
      if (request === sequence.current) setResult({ status: "network_error" });
    } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="alps-public-title" className="rounded-xl border border-teal/30 bg-card p-5 shadow-card">
      <div className="flex items-center gap-2">
        <Wifi className="size-5 text-teal" aria-hidden />
        <h2 id="alps-public-title" className="font-display text-xl font-extrabold">
          Alps2Alps — live public API test
        </h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Search official Alps2Alps locations and request current public prices.
        This private diagnostic is not linked to the fictional comparison demo.
        No bookings, affiliate tracking or checkout links are enabled.
        The active location directory loads once and filters suggestions as you type.
        Price requests are made only when you press Search; the provider rate-limits by IP.
      </p>

      <div className="mt-5 grid items-start gap-3 md:grid-cols-[1fr_auto_1fr]">
        <AlpsLocationAutocomplete
          key={`from-${swapId}`} label="Pickup location"
          selected={from} connectedTo={null} catalog={catalog}
          onSelected={updateFrom} disabled={busy}
        />
        <button
          type="button" onClick={swap} disabled={busy || !from || !to}
          aria-label="Swap pickup and destination"
          className="mt-7 inline-flex size-10 items-center justify-center rounded-full border border-input text-primary disabled:opacity-40"
        >
          <ArrowLeftRight className="size-4" aria-hidden />
        </button>
        <AlpsLocationAutocomplete
          key={`to-${swapId}`} label="Destination"
          selected={to} connectedTo={from} catalog={catalog}
          onSelected={updateTo} disabled={busy}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground" role="status">
        {catalog === null
          ? "Loading active Alps2Alps routes…"
          : catalog.status === "ok"
            ? `${catalog.catalog.activeRouteCount.toLocaleString("en-US")} active supplier routes loaded. Start typing to select a known location.`
            : "The route directory could not be loaded. Two-letter lookups will still be available when you type."}
      </p>

      <form onSubmit={(event) => void onSubmit(event)} className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm font-semibold">
            Pickup date (Alpine local)
            <input type="date" required value={date}
              min={todayInTimeZone("Europe/Zurich")}
              onChange={(event) => { invalidate(); setDate(event.target.value); }}
              className={inputClass} />
          </label>
          <label className="block text-sm font-semibold">
            Pickup time (local)
            <input type="time" required value={time}
              onChange={(event) => { invalidate(); setTime(event.target.value); }}
              className={inputClass} />
          </label>
          <label className="block text-sm font-semibold">
            Adults
            <select value={passengers}
              onChange={(event) => { invalidate(); setPassengers(Number(event.target.value)); }}
              className={inputClass}>
              {Array.from({ length: 16 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Currency
            <select value={currency}
              onChange={(event) => { invalidate(); setCurrency(event.target.value as AlpsPublicCurrency); }}
              className={inputClass}>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="USD">USD ($)</option>
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Suitcases
            <select value={luggage}
              onChange={(event) => { invalidate(); setLuggage(Number(event.target.value)); }}
              className={inputClass}>
              {Array.from({ length: 9 }, (_, i) => i).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold">
            Ski / snowboard bags
            <select value={skiBags}
              onChange={(event) => { invalidate(); setSkiBags(Number(event.target.value)); }}
              className={inputClass}>
              {Array.from({ length: 9 }, (_, i) => i).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Pickup time is interpreted literally (not as a flight arrival time).
          Children, return journeys and seats are not yet supported in this controlled test.
          Ski bags and suitcases are transmitted as separate values.
        </p>
        <button type="submit" disabled={busy || !from || !to || from.code === to.code ||
            (catalog?.status === "ok" && !alpsCatalogAllowsPair(catalog.catalog, from.code, to.code))}
          className="rounded-lg bg-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Retrieving live quote…" : "Search live public prices (no key)"}
        </button>
      </form>

      {result?.status === "ok" && completed && (
        <div className="mt-6 space-y-3">
          {result.bagAdjustment && (
            <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <strong>Ski bags excluded:</strong>{" "}
              Alps2Alps quoted 0 of the {result.bagAdjustment.requestedSkiBags} requested.
              Prices exclude ski bags; confirm transport and any extra fees with the provider.
            </div>
          )}
          <div role="status" className="rounded-lg border border-teal/20 bg-teal-soft/40 p-4 text-sm">
            <strong>Public quote API connection successful.</strong>{" "}
            {result.offers.length} live public {result.offers.length === 1 ? "price" : "prices"} for{" "}
            <strong>{result.route.from} → {result.route.to}</strong>, pickup{" "}
            {result.pickupTime} (local), {completed.passengers} adults,{" "}
            {result.luggage} suitcases and {result.skiBags} ski bags.
            No booking was created.
          </div>
          <p className="text-xs text-muted-foreground">
            Technical deep-link check: quotation link {result.linkEvidence.quoteUrlPresent ? "present" : "not verified"};
            {" "}{result.linkEvidence.vehicleUrlsPresent} of {result.offers.length} vehicle-specific links structurally verified.
            Links are intentionally disabled; no commission attribution has been confirmed.
          </p>
          <p className="text-xs text-muted-foreground">
            Private technical test only. Prices may change before checkout. Permission to compare
            offers publicly, final checkout price and commission tracking remain unconfirmed.
            GBP/USD quotes may reflect exchange rates that change before payment.
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
      {catalog?.status === "ok" && from && to &&
        !alpsCatalogAllowsPair(catalog.catalog, from.code, to.code) && (
          <p role="alert" className="mt-2 text-sm text-amber-700">
            This pickup/destination pair is not listed as an active Alps2Alps route.
            Choose another suggested location.
          </p>
        )}
      {result && result.status !== "ok" && (
        <div role="alert" className="mt-4 rounded-lg border bg-muted/30 p-4 text-sm">
          Public quote diagnostic: <code>{result.status}</code>.{" "}
          {result.status === "quote_mismatch" ? mismatchFields[result.field] : quoteError[result.status]}
          {result.status === "quote_mismatch" && result.requested !== undefined &&
            result.quoted !== undefined && (
              <span className="block mt-1">
                Requested: {result.requested}; returned by provider: {result.quoted}.
              </span>
            )}
          {result.status === "http_error" ? ` (HTTP ${result.httpStatus})` : ""}
          <p className="mt-1 text-xs text-muted-foreground">
            No credentials, booking links, or raw provider payloads are shown.
          </p>
        </div>
      )}
    </section>
  );
}
