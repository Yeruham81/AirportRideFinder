/**
 * Intui integration smoke test in GitHub Actions: one availability request.
 * It never logs the key, response payload, offer IDs, URLs or customer details.
 */
import { LOCATIONS } from "../src/data/locations.ts";
import { createIntuiAdapter } from "../src/providers/intui/adapter.server.ts";
import type { TransferSearchRequest } from "../src/domain/types.ts";

if (process.env["INTUI_DIAGNOSTIC_ALLOWED"] !== "adapter-smoke-20261105") {
  console.log(JSON.stringify({ status: "disabled" }));
  process.exit(2);
}
if (!process.env["INTUI_API_KEY"]?.trim()) {
  console.log(JSON.stringify({ status: "missing_secret" }));
  process.exit(2);
}

const sampleDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(sampleDate);
const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
const date = `${part("year")}-${part("month")}-${part("day")}`;

const request: TransferSearchRequest = {
  pickupId: "lhr",
  dropoffId: "central-london",
  localDate: date,
  localTime: "11:00",
  timeZone: "Europe/London",
  passengers: 2,
  luggage: 2,
  preferredCurrency: "USD",
};

const adapter = createIntuiAdapter(LOCATIONS, {
  enabled: true,
  timeoutMs: 15_000,
});
console.log(JSON.stringify({
  diagnostic: "single-real-readonly-adapter-test",
  route: "Heathrow to central London",
  date,
  currency: "USD",
  travellers: 2,
  luggage: 2,
}));

// Only one GET-availability-equivalent POST request, no booking calls/retries.
const result = await adapter.search(request, {
  searchRef: "diagnostic:heathrow-central-london:2:2",
});
if (result.status !== "ok") {
  console.log(JSON.stringify({
    status: result.status,
    errorCode: result.error?.code ?? null,
    offerCount: 0,
  }));
  process.exitCode = 1;
} else {
  const byCategory = new Map<string, number>();
  for (const o of result.offers) {
    byCategory.set(o.category, (byCategory.get(o.category) ?? 0) + 1);
  }
  const shortlist = [...result.offers]
    .sort((a,b) => a.price.quotedPrice.minor - b.price.quotedPrice.minor)
    .slice(0, 8)
    .map((o) => ({
      category: o.category,
      capacity: o.maxPassengers,
      bags: o.maxLuggage,
      totalUSD: (o.price.quotedPrice.minor / 100).toFixed(2),
      bookingEnabled: o.actionable,
      fees: o.price.taxesAndFees,
    }));
  console.log(JSON.stringify({
    status: "ok",
    verifiedOffers: result.offers.length,
    countByCategory: Object.fromEntries(byCategory),
    cheapestReadOnlyExamples: shortlist,
  }));
}
