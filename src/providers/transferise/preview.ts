/** Pure Transferise sandbox quote model. No public adapter or invented prices. */
import { moneyFromDecimal, type Money } from "@/domain/money";
import { isPastPickup, isValidDateString, isValidTimeString } from "@/domain/time";

export const TRANSFERISE_ENDPOINT = "https://transferise.com/api/widget.php";
export const TRANSFERISE_TIME_ZONE = "Europe/Istanbul";
export const TRANSFERISE_CURRENCIES = ["EUR", "GBP", "USD"] as const;
export type TransferiseCurrency = typeof TRANSFERISE_CURRENCIES[number];

interface PlaceLookup {
  query: string;
  names: readonly string[];
  iata?: string;
  kind?: string;
}

export const TRANSFERISE_PREVIEW_ROUTES: readonly {
  id: string; label: string; from: PlaceLookup; to: PlaceLookup;
}[] = [
  {
    id: "antalya-rixos", label: "Antalya Airport → Rixos Downtown Antalya Hotel",
    from: { query: "Antalya Airport", iata: "AYT", names: ["Antalya Airport", "Antalya Airport (AYT)"] },
    // The actual places response uses "Rixos Downtown Antalya Hotel".
    // Match that exact name (or a verified older alias) and use the returned ID.
    to: {
      query: "Rixos Downtown", kind: "hotel",
      names: ["Rixos Downtown Antalya Hotel", "Rixos Downtown Hotel", "Rixos Downtown Antalya"],
    },
  },
  {
    id: "antalya-kemer", label: "Antalya Airport → Kemer",
    from: { query: "Antalya Airport", iata: "AYT", names: ["Antalya Airport", "Antalya Airport (AYT)"] },
    to: { query: "Kemer", names: ["Kemer", "Kemer, Antalya", "Kemer (Antalya)"] },
  },
  {
    id: "istanbul-taksim", label: "Istanbul Airport → Taksim",
    from: { query: "Istanbul Airport", iata: "IST", names: ["Istanbul Airport", "Istanbul Airport (IST)", "İstanbul Airport"] },
    to: { query: "Taksim", names: ["Taksim", "Taksim Square", "Taksim, Istanbul", "Taksim (Istanbul)"] },
  },
];

export interface TransferisePreviewInput {
  routeId: string; date: string; time: string; passengers: number;
  currency: TransferiseCurrency;
}

export function prepareTransferiseSearch(input: TransferisePreviewInput, now = new Date()) {
  const route = TRANSFERISE_PREVIEW_ROUTES.find((item) => item.id === input.routeId);
  if (!route || !isValidDateString(input.date) || !isValidTimeString(input.time) ||
    !Number.isSafeInteger(input.passengers) || input.passengers < 1 || input.passengers > 16 ||
    !TRANSFERISE_CURRENCIES.includes(input.currency) ||
    isPastPickup(input.date, input.time, TRANSFERISE_TIME_ZONE, now) ||
    new Date(`${input.date}T00:00:00Z`).getTime() - now.getTime() > 366 * 86400_000) return null;
  return route;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function text(value: unknown, limit = 200): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= limit &&
    !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
}

function normalized(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export interface TransferisePlace { id: string; label: string }

export interface TransferisePlaceInspection {
  place: TransferisePlace | null;
  reason: "resolved" | "invalid_response" | "empty_results" | "no_exact_match" | "ambiguous";
  returnedCount: number;
  matchingCount: number;
  candidates: { id: string; name: string; kind: string }[];
}

/** Inspect only bounded location fields, never return the raw authenticated response. */
export function inspectTransferisePlace(
  body: unknown, lookup: PlaceLookup, hiddenValue?: string,
): TransferisePlaceInspection {
  const data = record(body);
  if (data?.["ok"] !== true || !Array.isArray(data["results"])) return {
    place: null, reason: "invalid_response", returnedCount: 0, matchingCount: 0, candidates: [],
  };
  const matches = new Map<string, TransferisePlace>();
  const candidates: TransferisePlaceInspection["candidates"] = [];
  const safeText = (value: unknown) => {
    const result = text(value);
    return result && (!hiddenValue || !result.includes(hiddenValue)) ? result : null;
  };
  for (const value of data["results"].slice(0, 100)) {
    const place = record(value);
    if (!place) continue;
    const id = text(place["id"], 100);
    const name = safeText(place["name"]);
    if (!id || !/^[a-z][a-z_]{0,24}:[1-9]\d{0,14}$/.test(id) || !name) continue;
    if (candidates.length < 6) candidates.push({ id, name, kind: safeText(place["kind"]) ?? "unknown" });
    if (lookup.kind && place["kind"] !== lookup.kind) continue;
    const matchesLookup = lookup.iata
      ? place["kind"] === "airport" && place["iata"] === lookup.iata
      : lookup.names.some((candidate) => normalized(candidate) === normalized(name));
    if (matchesLookup) matches.set(id, { id, label: safeText(place["label"]) ?? name });
  }
  return {
    place: matches.size === 1 ? [...matches.values()][0]! : null,
    reason: matches.size === 1 ? "resolved" : matches.size > 1 ? "ambiguous" :
      data["results"].length === 0 ? "empty_results" : "no_exact_match",
    returnedCount: data["results"].length, matchingCount: matches.size, candidates,
  };
}

/** Ordinary place resolution still requires one exact, unique provider record. */
export function resolveTransferisePlace(body: unknown, lookup: PlaceLookup): TransferisePlace | null {
  return inspectTransferisePlace(body, lookup).place;
}

export interface TransferiseLocationDiagnostic {
  stage: "pickup" | "destination";
  query: string;
  reason: TransferisePlaceInspection["reason"];
  returnedCount: number;
  matchingCount: number;
  candidates: TransferisePlaceInspection["candidates"];
}

export interface TransferisePreviewOffer {
  id: string; name: string; type: string | null; price: Money;
  maxPassengers: number; maxLuggage: number | null;
  paymentMethods: string[];
}

export function isTransferiseSandboxKey(key: string | undefined): key is string {
  return typeof key === "string" && key.length <= 512 && /^tfx_test_[A-Za-z0-9_-]+$/.test(key);
}

/** Keep the returned URL intact, including attribution; never invent affiliate params. */
export function safeTransferiseSandboxLink(raw: unknown, isTest: boolean): string | null {
  if (!isTest || typeof raw !== "string" || raw.length > 4096) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "transferise.com" || url.port ||
      url.username || url.password || [...url.searchParams.keys()].some((key) =>
        /^(?:key|api_?key|x-api-key|token)$/i.test(key))) return null;
    return raw;
  } catch { return null; }
}

export type TransferiseParsedQuote =
  | { kind: "ok"; offers: TransferisePreviewOffer[]; bookingUrl: string | null }
  | { kind: "malformed_response" | "api_rejected" };

/** Same currency and per-vehicle price as the API. No conversion or added margin. */
export function parseTransferiseQuote(body: unknown, input: TransferisePreviewInput): TransferiseParsedQuote {
  const data = record(body);
  if (!data || typeof data["ok"] !== "boolean") return { kind: "malformed_response" };
  if (data["ok"] !== true) return { kind: "api_rejected" };
  if (!Array.isArray(data["vehicles"]) || data["vehicles"].length > 100) return { kind: "malformed_response" };
  // Validate echoed search context where supplied by this API version.
  if ((data["date"] !== undefined && data["date"] !== input.date) ||
    (data["time"] !== undefined && data["time"] !== input.time) ||
    (data["passengers"] !== undefined && data["passengers"] !== input.passengers) ||
    data["round_trip"] === true) return { kind: "malformed_response" };

  const offers: TransferisePreviewOffer[] = [];
  const ids = new Set<string>();
  for (const value of data["vehicles"]) {
    const vehicle = record(value);
    if (!vehicle || vehicle["pricing"] !== "per_vehicle") continue;
    const id = String(vehicle["id"] ?? "");
    const name = text(vehicle["name"]);
    const capacity = vehicle["max_passengers"];
    if (!/^\d{1,15}$/.test(id) || ids.has(id) || !name ||
      !Number.isSafeInteger(capacity) || Number(capacity) < input.passengers ||
      vehicle["currency"] !== input.currency) continue;
    const amount = vehicle["price"];
    if (typeof amount !== "number" && typeof amount !== "string") continue;
    let price: Money;
    try { price = moneyFromDecimal(input.currency, String(amount)); } catch { continue; }
    if (price.minor <= 0) continue;
    const luggage = vehicle["max_luggage"];
    const methods = vehicle["payment_methods"];
    offers.push({
      id, name, type: text(vehicle["type"], 40), price, maxPassengers: Number(capacity),
      maxLuggage: Number.isSafeInteger(luggage) && Number(luggage) >= 0 ? Number(luggage) : null,
      paymentMethods: Array.isArray(methods) ? methods.filter((m): m is string =>
        ["cash_driver", "iyzico_split", "iyzico_full"].includes(String(m))).slice(0, 3) : [],
    });
    ids.add(id);
  }
  return {
    kind: "ok", offers,
    // Sandbox key is enforced by the server client. Require the response's test
    // flag as well before exposing any link, since the URL host is shared with live.
    bookingUrl: safeTransferiseSandboxLink(data["booking_url"], data["test"] === true),
  };
}


