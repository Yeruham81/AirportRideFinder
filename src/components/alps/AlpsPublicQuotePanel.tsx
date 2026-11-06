import { useRef, useState, type FormEvent } from "react";
import { ArrowLeftRight, CarFront, Luggage, MapPin, Search, UsersRound, Wifi } from "lucide-react";
import { formatMoney } from "@/domain/money";
import { defaultPickupDate } from "@/domain/time";
import {
  ALPS_INITIAL_FROM, ALPS_INITIAL_TO,
  fetchAlpsLocations, fetchAlpsPublicQuote,
  validateAlpsPublicQuery,
  type AlpsLocationSearchResult,
  type AlpsPublicCurrency,
  type AlpsPublicLocation,
  type AlpsPublicQuoteQuery,
  type AlpsPublicQuoteResult,
} from "@/providers/alps2alps/public-quote";

const inputClass = "mt-1 block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground";
const locationError: Record<string, string> = {
  invalid: "Enter at least two characters to search.",
  timeout: "Location lookup timed out.",
  network_error: "Unable to reach the public location search API.",
  rate_limited: "Too many location searches. Please pause before trying again.",
  malformed_response: "The location list did not match the documented response.",
  http_error: "The provider could not complete location lookup.",
};
const quoteError: Record<string, string> = {
  invalid: "Select two distinct provider locations, a future pickup and valid party / baggage counts.",
  timeout: "The live quote request timed out.",
  network_error: "Could not reach the public quote API from this browser.",
  rate_limited: "Rate limit reached. Avoid repeated quote requests.",
  malformed_response: "The quote did not confirm the selected route, pickup, currency or luggage.",
  no_offers: "No requested-time vehicles fit this search.",
  route_unavailable: "The provider does not currently support this pickup / destination combination.",
  http_error: "The provider returned an HTTP error. No quote was accepted.",
};

function AlpsLocationPicker({
  label, selected, onSelected, disabled,
}: {
  label: string;
  selected: AlpsPublicLocation | null;
  onSelected: (next: AlpsPublicLocation | null) => void;
  disabled: boolean;
}) {
  const [term, setTerm] = useState(selected?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AlpsLocationSearchResult | null>(null);
  const sequence = useRef(0);

  function edit(value: string) {
    sequence.current++;
    setTerm(value);
    setResult(null);
    onSelected(null);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled) return;
    const run = ++sequence.current;
    setBusy(true);
    setResult(null);
    try {
      const data = await fetchAlpsLocations(term);
      if (run === sequence.current) setResult(data);
    } catch {
      if (run === sequence.current) setResult({ status: "network_error" });
    } finally { setBusy(false); }
  }

  function choose(location: AlpsPublicLocation) {
    sequence.current++;
    setTerm(location.name);
    setResult(null);
    onSelected(location);
  }

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <form onSubmit={(event) => void search(event)}>
        <label className="block text-sm font-semibold">
          {label}
          <input
            type="text"
            maxLength={80}
            value={term}
            disabled={disabled}
            autoComplete="off"
            onChange={(event) => edit(event.target.value)}
            className={inputClass}
            placeholder="Airport, town or ski resort…"
          />
        </label>
        <button
          type="submit"
          disabled={disabled || busy || term.trim().length < 2 || term.length > 80}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-xs font-semibold text-primary disabled:opacity-50"
        >
          <Search className="size-3.5" aria-hidden />
          {busy ? "Finding locations…" : "Find locations"}
        </button>
      </form>
      {selected ? (
        <p className="flex items-center gap-1.5 text-xs text-teal" role="status">
          <MapPin className="size-3.5" aria-hidden />
          Selected: {selected.name}, {selected.country} ({selected.type})
        </p>
      ) : <p className="text-xs text-amber-700">Select a result before requesting prices.</p>}
      {result?.status === "ok" && (
        <div className="rounded-lg border bg-card p-2">
          {result.locations.length ? (
            <ul className="max-h-52 space-y-1 overflow-y-auto" aria-label={`${label} results`}>
              {result.locations.map((location) => (
                <li key={location.code}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => choose(location)}
                    className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted/70 focus-visible:bg-muted"
                  >
                    <span className="block font-semibold">{location.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {location.country} · {location.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="p-2 text-xs text-muted-foreground">No supported locations match this term.</p>}
        </div>
      )}
      {result && result.status !== "ok" && (
        <p role="alert" className="text-xs text-destructive">
          {locationError[result.status]}
          {result.status === "http_error" ? ` (HTTP ${result.httpStatus})` : ""}
        </p>
      )}
    </div>
  );
}

export function AlpsPublicQuotePanel() {
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
  function updateFrom(next: AlpsPublicLocation | null) { invalidate(); setFrom(next); }
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
        setResult(answer);
        setCompleted(query);
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
        Searches happen only when you press a button; the provider rate-limits by IP.
      </p>

      <div className="mt-5 grid items-start gap-3 md:grid-cols-[1fr_auto_1fr]">
        <AlpsLocationPicker
          key={`from-${swapId}`} label="Pickup location"
          selected={from} onSelected={updateFrom} disabled={busy}
        />
        <button
          type="button" onClick={swap} disabled={busy || !from || !to}
          aria-label="Swap pickup and destination"
          className="mt-7 inline-flex size-10 items-center justify-center rounded-full border border-input text-primary disabled:opacity-40"
        >
          <ArrowLeftRight className="size-4" aria-hidden />
        </button>
        <AlpsLocationPicker
          key={`to-${swapId}`} label="Destination"
          selected={to} onSelected={updateTo} disabled={busy}
        />
      </div>

      <form onSubmit={(event) => void onSubmit(event)} className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm font-semibold">
            Pickup date (Alpine local)
            <input type="date" required value={date}
              min={defaultPickupDate("Europe/Zurich", new Date(Date.now() - 6 * 86400000))}
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
        <button type="submit" disabled={busy || !from || !to || from.code === to.code}
          className="rounded-lg bg-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Retrieving live quote…" : "Search live public prices (no key)"}
        </button>
      </form>

      {result?.status === "ok" && completed && (
        <div className="mt-6 space-y-3">
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
      {result && result.status !== "ok" && (
        <div role="alert" className="mt-4 rounded-lg border bg-muted/30 p-4 text-sm">
          Public quote diagnostic: <code>{result.status}</code>.{" "}
          {quoteError[result.status]}
          {result.status === "http_error" ? ` (HTTP ${result.httpStatus})` : ""}
          <p className="mt-1 text-xs text-muted-foreground">
            No credentials, booking links, or raw provider payloads are shown.
          </p>
        </div>
      )}
    </section>
  );
}
