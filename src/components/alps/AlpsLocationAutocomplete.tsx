import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import {
  ALPS_INITIAL_FROM, ALPS_INITIAL_TO,
  fetchAlpsLocations, suggestAlpsCatalogLocations,
  type AlpsLocationSearchResult,
  type AlpsPublicLocation, type AlpsRouteCatalogResult,
} from "@/providers/alps2alps/public-quote";

const knownLocations: AlpsPublicLocation[] = [ALPS_INITIAL_FROM, ALPS_INITIAL_TO];

function knownSuggestions(
  term: string,
  result: AlpsLocationSearchResult | null,
  max = 16,
): AlpsPublicLocation[] {
  const q = term.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!q) return [];
  const all = [
    ...knownLocations,
    ...(result?.status === "ok" ? result.locations : []),
  ];
  const found = new Map<string, AlpsPublicLocation>();
  for (const location of all) {
    const name = location.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (name.includes(q)) found.set(location.code, location);
  }
  return [...found.values()].sort((a, b) =>
    Number(!a.name.toLowerCase().startsWith(q)) -
    Number(!b.name.toLowerCase().startsWith(q)) ||
    a.name.localeCompare(b.name, "en")).slice(0, max);
}

/** No search button. Catalog supports the first keystroke; fallback search is debounced. */
export function AlpsLocationAutocomplete({
  label, selected, connectedTo, catalog, onSelected, disabled,
}: {
  label: string;
  selected: AlpsPublicLocation | null;
  connectedTo: AlpsPublicLocation | null;
  catalog: AlpsRouteCatalogResult | null;
  onSelected: (next: AlpsPublicLocation | null) => void;
  disabled: boolean;
}) {
  const [term, setTerm] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [fallback, setFallback] = useState<AlpsLocationSearchResult | null>(null);
  const [loadingFallback, setLoadingFallback] = useState(false);
  const fallbackCounter = useRef(0);
  const listId = useId();

  useEffect(() => {
    // On a vendor catalog outage only: typeahead uses the separate official
    // location endpoint (which requires >= 2 chars). No provider request per key.
    if (disabled || !open || catalog?.status === "ok" ||
      catalog === null || term.trim().length < 2 ||
      (selected && selected.name === term)) return;
    const request = ++fallbackCounter.current;
    const timer = setTimeout(() => {
      setLoadingFallback(true);
      void fetchAlpsLocations(term.trim()).then(result => {
        if (fallbackCounter.current === request) setFallback(result);
      }).catch(() => {
        if (fallbackCounter.current === request) setFallback({ status: "network_error" });
      }).finally(() => {
        if (fallbackCounter.current === request) setLoadingFallback(false);
      });
    }, 420);
    return () => { clearTimeout(timer); fallbackCounter.current++; };
  }, [term, open, selected?.code, catalog?.status, disabled]);

  const matches = useMemo(() => {
    if (!open) return [];
    if (catalog?.status === "ok") {
      return suggestAlpsCatalogLocations(catalog.catalog, term, connectedTo?.code);
    }
    return knownSuggestions(term, fallback);
  }, [catalog, term, fallback, connectedTo?.code, open]);

  function edit(value: string) {
    setTerm(value);
    setFallback(null);
    setOpen(true);
    setActiveIndex(-1);
    if (selected !== null) onSelected(null);
  }

  function choose(location: AlpsPublicLocation) {
    setTerm(location.name);
    setOpen(false);
    setActiveIndex(-1);
    setFallback(null);
    onSelected(location);
  }

  return (
    <div className="relative min-w-0 flex-1 space-y-2">
      <label htmlFor={listId + "-input"} className="block text-sm font-semibold">
        {label}
      </label>
      <input
        id={listId + "-input"}
        type="text"
        maxLength={80}
        value={term}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && activeIndex >= 0 && matches[activeIndex]
          ? listId + "-item-" + activeIndex : undefined}
        placeholder="Start typing an airport or resort…"
        className="block h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); setActiveIndex(-1); }}
        onChange={event => edit(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Escape") {
            setOpen(false);
            setActiveIndex(-1);
          } else if (event.key === "ArrowDown" && matches.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(i => (i + 1) % matches.length);
          } else if (event.key === "ArrowUp" && matches.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex(i => i <= 0 ? matches.length - 1 : i - 1);
          } else if (event.key === "Enter" && open && matches.length) {
            event.preventDefault();
            choose(matches[activeIndex >= 0 ? activeIndex : 0]!);
          }
        }}
      />
      {selected ? (
        <p role="status" className="flex items-center gap-1 text-xs text-teal">
          <MapPin className="size-3.5" aria-hidden />
          {selected.name}{selected.country ? ", " + selected.country : ""} · {selected.type.replace("_", " ")}
        </p>
      ) : <p className="text-xs text-amber-700">Choose a suggested location.</p>}

      {open && term.trim().length > 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-input bg-card p-1.5 shadow-lg">
          {matches.length > 0 ? (
            <ul id={listId} role="listbox" aria-label={label + " suggestions"}
              className="max-h-60 overflow-y-auto">
              {matches.map((location, index) => (
                <li role="presentation" key={location.code}>
                  <button
                    id={listId + "-item-" + index}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    disabled={disabled}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => choose(location)}
                    className={"block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted " +
                      (index === activeIndex ? "bg-muted" : "")}
                  >
                    <span className="block font-semibold">{location.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {location.country ? location.country + " · " : ""}
                      {location.type.replace("_", " ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-2 text-xs text-muted-foreground" role="status">
              {catalog === null ? "Loading the provider's active route catalog…" :
                catalog.status !== "ok" && term.trim().length < 2
                  ? "Type one more character to search the provider's locations." :
                loadingFallback ? "Checking provider locations…" :
                "No matching active supplier locations."}
            </p>
          )}
          {catalog?.status !== "ok" && catalog !== null && fallback &&
            fallback.status !== "ok" && (
              <p className="px-2 pb-2 text-xs text-amber-700">
                Provider location search is temporarily unavailable.
              </p>
            )}
        </div>
      )}
    </div>
  );
}
