/**
 * Single read-only Intui metadata diagnostic: printed information is aggregate
 * safe class/type/price metadata only. No API keys, URL, IDs, raw responses or
 * numeric price values. This does not create bookings.
 */
import { LOCATIONS } from "../src/data/locations.ts";
import { buildIntuiGeoRequest } from "../src/providers/intui/request.ts";
import { fetchIntuiGetAvailCar } from "../src/providers/intui/client.server.ts";
import type { TransferSearchRequest } from "../src/domain/types.ts";

if (process.env["INTUI_DIAGNOSTIC_ALLOWED"] !== "metadata-smoke-20261105" ||
  !process.env["INTUI_API_KEY"]?.trim()) process.exit(2);

const date = new Date(Date.now() + 10 * 86400000);
const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(date);
const val = (type: string) => parts.find((p) => p.type === type)?.value;
const req: TransferSearchRequest = {
  pickupId: "lhr", dropoffId: "central-london",
  localDate: `${val("year")}-${val("month")}-${val("day")}`,
  localTime: "11:00",
  timeZone: "Europe/London",
  passengers: 2, luggage: 2, preferredCurrency: "USD",
};
const pickup = LOCATIONS.find((p) => p.id === "lhr")!;
const dropoff = LOCATIONS.find((p) => p.id === "central-london")!;
const query = buildIntuiGeoRequest(req, pickup, dropoff);

console.log(JSON.stringify({ diagnostic: "intui-metadata-aggregate", requestCount: 1 }));
const result = await fetchIntuiGetAvailCar(query, { timeoutMs: 20000 });
if (result.status !== "unverified_price_contract") {
  console.log(JSON.stringify({ status: result.status }));
  process.exitCode = result.status === "no_offers" ? 0 : 1;
} else {
  const diagnostics = result.data.diagnostics;
  const frequency = (key: "vehicleType" | "vehicleClass" | "bodyType") => {
    const counter = new Map<string, number>();
    for (const diagnostic of diagnostics) {
      const v = diagnostic[key];
      const safe = typeof v === "string" && /^[A-Za-z0-9 _+./()\-]{1,48}$/.test(v)
        ? v : "[other]";
      counter.set(safe, (counter.get(safe) ?? 0) + 1);
    }
    return Array.from(counter).sort((a, b) => b[1] - a[1]).slice(0, 30)
      .map(([label, count]) => ({ label, count }));
  };
  console.log(JSON.stringify({
    status: "ok",
    candidateCount: result.data.omittedCount,
    candidatesWithCapacity: diagnostics.length,
    categories: {
      vehicleType: frequency("vehicleType"),
      bodyType: frequency("bodyType"),
      vehicleClass: frequency("vehicleClass"),
    },
    withUSDNumericPrice: diagnostics.filter(
      (d) => d.requestedCurrencyPriceType === "number",
    ).length,
  }));
}
