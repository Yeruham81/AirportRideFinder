/** Actual provider location records, used for autocomplete and selected-ID revalidation. */
import { isPastPickup, isValidDateString, isValidTimeString } from "@/domain/time";
import { TRANSFERISE_CURRENCIES, type TransferiseCurrency } from "./preview";

export const TRANSFERISE_PLACE_ID = /^[a-z][a-z_]{0,24}:[A-Za-z0-9_-]{1,80}$/;
export const TRANSFERISE_AUTOCOMPLETE_MIN = 2;

export const TRANSFERISE_PICKUP_ZONES = [
  ["Europe/Istanbul", "Türkiye — Istanbul"], ["Europe/London", "United Kingdom — London"],
  ["Europe/Dublin", "Ireland — Dublin"], ["Europe/Paris", "France — Paris"],
  ["Europe/Brussels", "Belgium — Brussels"], ["Europe/Amsterdam", "Netherlands — Amsterdam"],
  ["Europe/Madrid", "Mainland Spain — Madrid"], ["Atlantic/Canary", "Canary Islands"],
  ["Europe/Lisbon", "Portugal — Lisbon"], ["Europe/Rome", "Italy — Rome"],
  ["Europe/Athens", "Greece — Athens"], ["Europe/Berlin", "Germany — Berlin"],
  ["Europe/Zurich", "Switzerland — Zurich"], ["Africa/Nairobi", "Kenya — Nairobi"],
  ["Africa/Cairo", "Egypt — Cairo"], ["Africa/Casablanca", "Morocco — Casablanca"],
  ["Asia/Dubai", "United Arab Emirates — Dubai"],
] as const;

export function validTransferisePickupZone(zone: string): boolean {
  if (!zone || zone.length > 80 || !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(zone)) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: zone }).format(); return true; } catch { return false; }
}

export function transferisePickupZoneOptions(): { value: string; label: string }[] {
  const zones = new Map<string, string>(TRANSFERISE_PICKUP_ZONES);
  const supported = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (supported) for (const zone of supported("timeZone")) if (!zones.has(zone)) zones.set(zone, zone.replaceAll("_", " "));
  return [...zones].map(([value, label]) => ({ value, label }));
}

const AIRPORT_ZONES: Record<string, string> = {};
for (const [zone, airports] of [
  ["Europe/Istanbul", "AYT IST SAW ADB DLM BJV GZP ASR NAV TZX"],
  ["Europe/London", "LHR LGW STN LTN LCY SEN MAN BHX ABZ EDI GLA"],
  ["Europe/Paris", "CDG ORY NCE LYS"], ["Europe/Madrid", "MAD BCN AGP ALC VLC"],
  ["Atlantic/Canary", "TFS TFN LPA ACE SPC"], ["Europe/Brussels", "BRU ANR"],
  ["Europe/Amsterdam", "AMS"], ["Europe/Rome", "FCO CIA"], ["Europe/Athens", "ATH"],
  ["Africa/Nairobi", "NBO"], ["Asia/Dubai", "DXB DWC"], ["Africa/Cairo", "CAI HRG SSH"],
] as const) for (const iata of airports.split(" ")) AIRPORT_ZONES[iata] = zone;

function clean(value: unknown, limit = 200, hiddenValue?: string): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit &&
    !/[\u0000-\u001f\u007f]/.test(value) && (!hiddenValue || !value.includes(hiddenValue)) ? value.trim() : null;
}

export function cleanTransferisePlaceQuery(value: string): string | null {
  const q = value.trim();
  return q.length >= TRANSFERISE_AUTOCOMPLETE_MIN && q.length <= 100 &&
    !/[\u0000-\u001f\u007f]/.test(q) ? q : null;
}

export interface TransferiseSelectablePlace {
  id: string; name: string; label: string; kind: string; country: string | null;
  iata: string | null; timeZone: string | null; searchQuery: string;
}
export type TransferisePlaceSuggestions =
  | { kind: "ok"; places: TransferiseSelectablePlace[] }
  | { kind: "error"; code: string; httpStatus?: number | null; providerCode?: string | null };

function pickupZone(iata: string | null, country: string | null) {
  if (iata && AIRPORT_ZONES[iata]) return AIRPORT_ZONES[iata]!;
  const key = country?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (["turkiye", "turkey", "tr"].includes(key ?? "")) return "Europe/Istanbul";
  if (["kenya", "ke"].includes(key ?? "")) return "Africa/Nairobi";
  if (["belgium", "be"].includes(key ?? "")) return "Europe/Brussels";
  if (["united arab emirates", "uae", "ae"].includes(key ?? "")) return "Asia/Dubai";
  return null; // Never silently apply Türkiye's clock to an unknown pickup.
}

export function parseTransferisePlaces(body: unknown, query: string, hiddenValue?: string): TransferisePlaceSuggestions {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { kind: "error", code: "malformed_response" };
  const data = body as Record<string, unknown>;
  if (data["ok"] !== true || !Array.isArray(data["results"]))
    return { kind: "error", code: "malformed_response" };
  const places = new Map<string, TransferiseSelectablePlace>();
  // Broad prefixes may legitimately yield many records; bound processing, not
  // the validity of the entire reply. The transport already bounds body bytes.
  for (const raw of data["results"].slice(0, 200)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const id = clean(item["id"], 100, hiddenValue);
    const name = clean(item["name"], 200, hiddenValue);
    const label = clean(item["label"], 300, hiddenValue) ?? name;
    const kind = clean(item["kind"], 32, hiddenValue);
    if (!id || !TRANSFERISE_PLACE_ID.test(id) || !name || !label || !kind) continue;
    const country = clean(item["country"], 100, hiddenValue);
    const code = clean(item["iata"], 3, hiddenValue);
    const iata = code && /^[A-Z]{3}$/.test(code) ? code : null;
    places.set(id, { id, name, label, kind, country, iata, timeZone: pickupZone(iata, country), searchQuery: query });
  }
  return { kind: "ok", places: [...places.values()] };
}

export interface TransferiseSelectedSearchInput {
  from: { id: string; query: string }; to: { id: string; query: string };
  date: string; time: string; passengers: number; currency: TransferiseCurrency;
  pickupTimeZone: string;
}

export function validTransferiseSelectedSearch(input: TransferiseSelectedSearchInput, now = new Date()) {
  return !!cleanTransferisePlaceQuery(input.from.query) && !!cleanTransferisePlaceQuery(input.to.query) &&
    TRANSFERISE_PLACE_ID.test(input.from.id) && TRANSFERISE_PLACE_ID.test(input.to.id) && input.from.id !== input.to.id &&
    validTransferisePickupZone(input.pickupTimeZone) &&
    isValidDateString(input.date) && isValidTimeString(input.time) &&
    Number.isSafeInteger(input.passengers) && input.passengers >= 1 && input.passengers <= 16 &&
    TRANSFERISE_CURRENCIES.includes(input.currency) &&
    !isPastPickup(input.date, input.time, input.pickupTimeZone, now) &&
    new Date(`${input.date}T00:00:00Z`).getTime() - now.getTime() <= 366 * 86400_000;
}

