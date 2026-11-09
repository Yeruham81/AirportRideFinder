import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import {
  TRANSFERISE_AUTOCOMPLETE_MIN, type TransferisePlaceSuggestions, type TransferiseSelectablePlace,
} from "@/providers/transferise/locations";

const DEBOUNCE_MS = 350;
const CACHE_MS = 5 * 60_000;
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** No invented locations; text is never accepted as a selected place. */
export function TransferiseLocationAutocomplete({ label, selected, onSelected, search, disabled = false }: {
  label: string; selected: TransferiseSelectablePlace | null;
  onSelected: (place: TransferiseSelectablePlace | null) => void;
  search: (query: string) => Promise<TransferisePlaceSuggestions>; disabled?: boolean;
}) {
  const id = useId();
  const [term, setTerm] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ query: string; result: TransferisePlaceSuggestions } | null>(null);
  const generation = useRef(0);
  const cache = useRef(new Map<string, { places: TransferiseSelectablePlace[]; until: number }>());
  const query = term.trim();
  const cacheKey = normalize(query);

  useEffect(() => {
    if (selected) setTerm(selected.label);
  }, [selected?.id, selected?.label]);

  useEffect(() => {
    const request = ++generation.current;
    setLoading(false);
    if (disabled || !open || query.length < TRANSFERISE_AUTOCOMPLETE_MIN ||
      (selected && selected.label === term)) return;
    const hit = cache.current.get(cacheKey);
    if (hit && hit.until > Date.now()) {
      setResponse({ query: cacheKey, result: { kind: "ok", places: hit.places } });
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      void search(query).then((result) => {
        if (request !== generation.current) return;
        setResponse({ query: cacheKey, result }); setActive(-1);
        if (result.kind === "ok") {
          if (cache.current.size >= 30) cache.current.delete(cache.current.keys().next().value!);
          cache.current.set(cacheKey, { places: result.places, until: Date.now() + CACHE_MS });
        }
      }).catch(() => {
        if (request === generation.current) setResponse({ query: cacheKey, result: { kind: "error", code: "request_failed" } });
      }).finally(() => { if (request === generation.current) setLoading(false); });
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); generation.current++; };
  }, [query, cacheKey, term, open, disabled, selected?.id, selected?.label, search]);

  let matches: TransferiseSelectablePlace[] = [];
  if (response?.query === cacheKey && response.result.kind === "ok") matches = response.result.places;
  else if (query.length > 0) {
    // Already verified records can respond to the first character locally.
    const local = new Map<string, TransferiseSelectablePlace>();
    for (const entry of cache.current.values()) if (entry.until > Date.now()) {
      for (const place of entry.places) if (normalize(place.label + " " + place.name).includes(cacheKey)) local.set(place.id, place);
    }
    matches = [...local.values()];
  }
  matches = matches.slice(0, 30);
  const error = response?.query === cacheKey && response.result.kind === "error" ? response.result.code : null;
  const show = open && query.length > 0 && !disabled;

  function edit(value: string) {
    generation.current++; setTerm(value); setResponse(null); setActive(-1); setOpen(true); setLoading(false);
    if (selected !== null) onSelected(null);
  }
  function choose(place: TransferiseSelectablePlace) {
    generation.current++; setTerm(place.label); setOpen(false); setActive(-1); setLoading(false);
    onSelected(place);
  }

  return (
    <div className="relative min-w-0 space-y-2">
      <label htmlFor={id + "-input"} className="block text-sm font-semibold">{label}</label>
      <input id={id + "-input"} role="combobox" type="text" value={term} disabled={disabled} required maxLength={100}
        autoComplete="off" aria-autocomplete="list" aria-expanded={show} aria-controls={id + "-list"}
        aria-describedby={id + "-selection"} aria-busy={loading}
        aria-activedescendant={show && active >= 0 && matches[active] ? id + "-option-" + active : undefined}
        placeholder="Start typing an airport, hotel or destination…"
        className="block h-11 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        onChange={(event) => edit(event.target.value)} onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); setActive(-1); generation.current++; setLoading(false); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") { setOpen(false); setActive(-1); }
          else if (event.key === "ArrowDown" && matches.length) { event.preventDefault(); setOpen(true); setActive((index) => (index + 1) % matches.length); }
          else if (event.key === "ArrowUp" && matches.length) { event.preventDefault(); setOpen(true); setActive((index) => index <= 0 ? matches.length - 1 : index - 1); }
          else if (event.key === "Enter" && show && matches.length) { event.preventDefault(); choose(matches[active >= 0 ? active : 0]!); }
          else if (event.key === "Enter" && !selected) event.preventDefault();
        }} />
      <p id={id + "-selection"} className={"flex items-center gap-1 text-xs " + (selected ? "text-teal" : "text-muted-foreground")}>
        {selected ? <><MapPin className="size-3.5" aria-hidden /> Selected: {selected.label}</> : "Choose a location from the suggestions."}
      </p>
      {show && <div className="absolute z-30 w-full rounded-lg border bg-card p-1.5 shadow-lg">
        <ul id={id + "-list"} role="listbox" aria-label={label + " suggestions"} className="max-h-64 overflow-y-auto">
          {matches.map((place, index) => <li key={place.id} role="presentation">
            <button type="button" role="option" id={id + "-option-" + index} aria-selected={active === index}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(place)}
              className={"block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted " + (active === index ? "bg-muted" : "")}>
              <span className="block font-semibold">{place.name}</span>
              <span className="block text-xs text-muted-foreground">{place.label !== place.name ? place.label + " · " : ""}{place.kind}{place.iata ? " · " + place.iata : ""}{place.country ? " · " + place.country : ""}</span>
            </button>
          </li>)}
        </ul>
        <p role="status" className="px-2 py-1 text-xs text-muted-foreground">
          {error ? (error === "authentication_required" ? "Preview session expired. Sign in again." : error === "rate_limited" ? "Location search limit reached. Pause before trying again." : "Provider location search is temporarily unavailable.") :
            loading ? "Searching Transferise locations…" :
            matches.length ? "Select a matching location." :
            query.length < TRANSFERISE_AUTOCOMPLETE_MIN ? "Type at least 2 characters to search Transferise." : "No matching locations returned by Transferise."}
        </p>
      </div>}
    </div>
  );
}
