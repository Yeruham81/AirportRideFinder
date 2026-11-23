export const ALPS_PARTNER_CODE = "AIRPORTRIDEFINDER";
export const ALPS_QUOTE_MAX_AGE_MS = 60_000;

/** Validate without serializing: callers must retain the original supplier URL. */
export function isAlpsBookingUrl(input: unknown, kind: "quote" | "vehicle" = "vehicle"): input is string {
  if (typeof input !== "string" || input.length > 4096 || /[\x00-\x20\x7f]/.test(input)) return false;
  try {
    const url = new URL(input);
    const suffix = kind === "quote" ? "quick-search" : "quick-checkout";
    if (url.origin !== "https://booking.alps2alps.com" || url.username || url.password || url.hash ||
      ![`/book/${suffix}`, `/booking/${suffix}`].includes(url.pathname) ||
      url.searchParams.get("pc") !== ALPS_PARTNER_CODE) return false;
    for (const key of url.searchParams.keys()) {
      if (url.searchParams.getAll(key).length !== 1 || key.startsWith("return") ||
        key === "is_return") return false;
    }
    return ["promo", "promo_code"].every(key =>
      !url.searchParams.has(key) || url.searchParams.get(key) === ALPS_PARTNER_CODE);
  } catch { return false; }
}
