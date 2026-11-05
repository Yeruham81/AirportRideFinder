/**
 * Targeted, single-request Intui.travel JSON shape diagnostic.
 * Output contains ONLY key names, structural types and array lengths. No values
 * from the provider response are ever printed or stored. No booking/payment calls.
 */
const ENDPOINT = "https://api.intui.travel/ver1_0/GetAvailCar/";

if (process.env.INTUI_DIAGNOSTIC_ALLOWED !== "shape-20261105") {
  console.log("Intui response shape diagnostic is disabled.");
  process.exit(2);
}
const apiKey = process.env.INTUI_API_KEY?.trim();
if (!apiKey) {
  console.log(JSON.stringify({ diagnostic: "intui-shape", status: "missing_secret" }));
  process.exit(2);
}

function londonDateTenDaysAhead() {
  const date = new Date(Date.now() + 10 * 86400000);
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const get = (type) => p.find((x) => x.type === type)?.value;
  return get("year") + "-" + get("month") + "-" + get("day") + "T11:00:00";
}

const request = {
  apikey: apiKey,
  coordinatesType: "GEO",
  gpsLatR: 51.47,
  gpsLngR: -0.4543,
  gpsLatEnd: 51.5115,
  gpsLngEnd: -0.1235,
  adults: 2,
  arrivalDateTime: londonDateTenDaysAhead(),
  currency: "USD",
  lang: "en",
  multiprice: false,
};

const safeName = (key) => {
  // Only schema field names, never arbitrary data or string values.
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(key)) return "[other_key]";
  if (/key|auth|token|password|secret|email|phone|name|url|link|id/i.test(key)) {
    return "[sensitive_field]";
  }
  return key;
};

// No raw values are passed to logger; only structure is emitted.
// Depth and branching limits bound output, even for malformed responses.
function shape(value, depth = 0) {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    const result = { type: "array", count: value.length };
    if (value.length && depth < 7) result.first = shape(value[0], depth + 1);
    return result;
  }
  if (typeof value === "object") {
    const allKeys = Object.keys(value);
    const result = { type: "object", fieldCount: allKeys.length };
    if (depth < 7) {
      result.fields = allKeys.slice(0, 14).map((key) => ({
        field: safeName(key),
        value: shape(value[key], depth + 1),
      }));
    }
    return result;
  }
  return { type: typeof value };
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 20000);
console.log(JSON.stringify({ diagnostic: "intui-shape", request: "one read-only GetAvailCar", passengers: 2, currency: "USD" }));
try {
  // Exactly one request. There is deliberately no retry.
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(request),
    redirect: "error",
    signal: controller.signal,
  });
  console.log(JSON.stringify({ httpStatus: response.status }));
  if (!response.ok) {
    process.exitCode = 1;
  } else {
    const text = await response.text();
    if (text.length > 1_000_000) {
      console.log(JSON.stringify({ errorClass: "response_too_large" }));
      process.exitCode = 1;
    } else {
      let json;
      try { json = JSON.parse(text); }
      catch { json = undefined; }
      if (json === undefined) {
        console.log(JSON.stringify({ errorClass: "invalid_json" }));
        process.exitCode = 1;
      } else {
        // The output does NOT contain any response leaf values.
        const report = { shape: shape(json) };
        console.log(JSON.stringify(report).slice(0, 12000));
      }
    }
  }
} catch {
  console.log(JSON.stringify({ errorClass: controller.signal.aborted ? "timeout" : "network_error" }));
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
