/**
 * Last read-only Intui filtering diagnostic. No raw provider data, link, ID,
 * key, or price value is emitted; only aggregate acceptance/rejection counts.
 */
if (process.env["INTUI_DIAGNOSTIC_ALLOWED"] !== "filter-20261105" ||
  !process.env["INTUI_API_KEY"]?.trim()) process.exit(2);
const date = new Date(Date.now() + 10 * 86400000);
const parts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(date);
const val = (type) => parts.find((p) => p.type === type)?.value;
const query = {
  coordinatesType: "GEO",
  gpsLatR: 51.47, gpsLngR: -0.4543,
  gpsLatEnd: 51.5115, gpsLngEnd: -0.1235,
  adults: 2, arrivalDateTime: `${val("year")}-${val("month")}-${val("day")}T11:00:00`,
  currency: "USD", lang: "en", multiprice: false,
  apikey: process.env["INTUI_API_KEY"],
};
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 20_000);
const report = {
  status: "unknown",
  total: 0,
  validPrivate: 0,
  perpersonTrue: 0,
  productIdTypes: { number: 0, string: 0, missing: 0, other: 0 },
  productIdNumericString: 0,
  validProductId: 0,
  enoughCapacity: 0,
  enoughBags: 0,
  knownRoadClass: 0,
  positiveUSDPrice: 0,
  allChecksExceptId: 0,
  allChecks: 0,
  alternateIdNamesPresent: [],
};
try {
  const r = await fetch("https://api.intui.travel/ver1_0/GetAvailCar/", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    redirect: "error", signal: controller.signal, body: JSON.stringify(query),
  });
  if (r.status !== 200) { console.log(JSON.stringify({ httpStatus: r.status })); process.exit(1); }
  const raw = await r.text();
  if (raw.length > 1_000_000) throw new Error("oversized");
  const json = JSON.parse(raw);
  const envelope = json?.response && typeof json.response === "object"
    ? Object.values(json.response)[0] : undefined;
  const rows = Array.isArray(envelope?.travelling) ? envelope.travelling : [];
  report.status = json?.status === "ok" ? "ok" : "other";
  report.total = rows.length;
  const alternates = new Set();
  for (const row of rows) {
    const info = row?.info ?? {};
    const id = info.productid;
    if (id === undefined || id === null) report.productIdTypes.missing++;
    else if (typeof id === "number") report.productIdTypes.number++;
    else if (typeof id === "string") {
      report.productIdTypes.string++;
      if (/^[1-9][0-9]{0,15}$/.test(id)) report.productIdNumericString++;
    } else report.productIdTypes.other++;
    const validId = typeof id === "number" && Number.isSafeInteger(id) && id > 0 ||
      typeof id === "string" && /^[1-9][0-9]{0,15}$/.test(id);
    if (validId) report.validProductId++;
    for (const name of ["productId", "id", "carid", "vehicleId", "transferId"]) {
      if (info[name] != null) alternates.add(name);
    }
    const privateCar = info.vehicle_type === "private";
    if (privateCar) report.validPrivate++;
    const perperson = info.perperson === true;
    if (perperson) report.perpersonTrue++;
    const pax = Number(info.maxpax);
    const bags = Number(info.luggage);
    const paxOk = Number.isSafeInteger(pax) && pax >= 2;
    const bagOk = Number.isSafeInteger(bags) && bags >= 2;
    if (paxOk) report.enoughCapacity++;
    if (bagOk) report.enoughBags++;
    const body = info.type_vehicle;
    const vClass = info.vehicle_class;
    const road = ["Minivan", "Minibus", "Bus", "Coach"].includes(body) &&
      ["Economy class", "Standard", "Business", "Luxury", "N/a"].includes(vClass) ||
      ["Sedan", "Station Wagon", "Hatchback"].includes(body) &&
      ["Economy class", "Standard", "Business", "Luxury"].includes(vClass) ||
      body === "Limousine" && vClass === "Luxury" ||
      body === "High class sedan" && vClass === "Business" ||
      body === "Superior High class sedan" && vClass === "Luxury";
    if (road) report.knownRoadClass++;
    const price = row?.pricing?.allprice?.USD;
    const priceOk = typeof price === "number" && Number.isFinite(price) &&
      price > 0 && /^\d+(?:\.\d{1,2})?$/.test(String(price));
    if (priceOk) report.positiveUSDPrice++;
    const checksExceptId = privateCar && !perperson && paxOk && bagOk && road && priceOk;
    if (checksExceptId) report.allChecksExceptId++;
    if (checksExceptId && validId) report.allChecks++;
  }
  report.alternateIdNamesPresent = Array.from(alternates);
  console.log(JSON.stringify(report));
} catch {
  console.log(JSON.stringify({ status: controller.signal.aborted ? "timeout" : "safe_error" }));
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
}
