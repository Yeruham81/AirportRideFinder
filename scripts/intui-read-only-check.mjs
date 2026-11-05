/**
 * One-shot, read-only Intui.travel API diagnostic. NO bookings or payments.
 * Must only execute from the dedicated manually labeled GitHub PR event.
 * Never logs API keys, raw requests/responses, provider URLs or personal data.
 */
const ENDPOINT = "https://api.intui.travel/ver1_0/GetAvailCar/";

if (process.env.INTUI_DIAGNOSTIC_ALLOWED !== "yes") {
  console.log("Diagnostic not enabled.");
  process.exit(2);
}
const apiKey = process.env.INTUI_API_KEY?.trim();
if (!apiKey) {
  console.log(JSON.stringify({ status: "missing_secret", keyName: "INTUI_API_KEY" }));
  process.exit(2);
}

function dateTenDaysAheadLondon() {
  const d = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const value = (type) => parts.find((p) => p.type === type)?.value;
  return value("year") + "-" + value("month") + "-" + value("day") + "T11:00:00";
}

const payload = {
  apikey: apiKey,
  coordinatesType: "GEO",
  gpsLatR: 51.47,
  gpsLngR: -0.4543,
  gpsLatEnd: 51.5115,
  gpsLngEnd: -0.1235,
  adults: 2,
  arrivalDateTime: dateTenDaysAheadLondon(),
  currency: "USD",
  lang: "en",
  multiprice: false,
};

const shortString = (v) => typeof v === "string" && v.length < 30 &&
  /^[a-zA-Z0-9 €$£.,]+$/.test(v) ? v : "[non-numeric]";
function describePrice(value) {
  if (value === null || value === undefined) return { type: "absent" };
  if (typeof value === "number") return Number.isFinite(value) ?
    { type: "number", sample: value } : { type: "invalid_number" };
  if (typeof value === "string") return { type: "string", sample: shortString(value) };
  if (Array.isArray(value)) return {
    type: "array",
    count: value.length,
    first: value.length ? describePrice(value[0]) : null,
  };
  if (typeof value === "object") {
    const keys = Object.keys(value).slice(0, 8);
    return { type: "object", keys, members: Object.fromEntries(
      keys.map((key) => [key, describePrice(value[key])]),
    ) };
  }
  return { type: typeof value };
}
const safeKey = (v) => typeof v === "string" && /^[a-zA-Z0-9_]{1,40}$/.test(v) ? v : "other";
const safeStatus = (v) =>
  ["ok", "authorization_error", "wrong_params"].includes(v) ? v : "other";

console.log(JSON.stringify({
  stage: "one-shot-read-only",
  route: "Heathrow airport to central London",
  passengers: 2,
  currency: "USD",
  pickupLocal: payload.arrivalDateTime,
  secretConfigured: true,
}));

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 20000);
try {
  // Exactly ONE request, no retry or redirect.
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    redirect: "error",
    body: JSON.stringify(payload),
    signal: controller.signal,
  });
  console.log(JSON.stringify({ httpStatus: response.status }));
  if (!response.ok) {
    console.log(JSON.stringify({ result: "http_error" }));
    process.exitCode = 1;
  } else {
    const body = await response.text();
    if (body.length > 1_000_000) throw new Error("oversized_response");
    let json;
    try {
      json = JSON.parse(body);
    } catch {
      throw new Error("unparseable_json");
    }
    const rows = json?.LocationInfo?.travelling;
    const summary = {
      result: safeStatus(json?.status),
      travellingType: Array.isArray(rows) ? "array" : typeof rows,
      travellingCount: Array.isArray(rows) ? rows.length : null,
      sample: Array.isArray(rows) ? rows.slice(0, 3).map((r) => ({
        vehicleClass: safeKey(r?.info?.vehicle_class),
        vehicleType: safeKey(r?.info?.vehicle_type),
        maxPassengers: Number.isSafeInteger(r?.info?.maxpax) ? r.info.maxpax : null,
        luggage: Number.isSafeInteger(r?.info?.luggage) ? r.info.luggage : null,
        pricingKeys: r?.pricing && typeof r.pricing === "object" ?
          Object.keys(r.pricing).map(safeKey).slice(0, 8) : [],
        allprice: describePrice(r?.pricing?.allprice),
      })) : [],
    };
    console.log(JSON.stringify(summary));
    if (json?.status !== "ok") process.exitCode = 1;
  }
} catch (error) {
  const classification = controller.signal.aborted ? "timeout" :
    error?.message === "oversized_response" ? "oversized_response" :
    error?.message === "unparseable_json" ? "unparseable_json" : "network_error";
  console.log(JSON.stringify({ result: classification }));
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}
