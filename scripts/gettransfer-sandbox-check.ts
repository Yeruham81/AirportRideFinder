/**
 * Phase 2A manual diagnostic: ONE read-only GET /route_info against the
 * GetTransfer SANDBOX (gtrbox.org). Developer environment only.
 *
 *   bun scripts/gettransfer-sandbox-check.ts
 *
 * Reads GETTRANSFER_SANDBOX_TOKEN from the environment (Lovable secrets).
 * Never prints the token, the request headers or the raw response body.
 * Not bundled into the app; not reachable from any page or endpoint.
 *
 * Route: Heathrow (LHR) -> "Central London". The destination is a
 * representative city-centre point from src/data/locations.ts, NOT a hotel.
 */
import { getLocation } from "../src/data/locations";
import { localDateTimeWithOffset } from "../src/domain/time";
import { sandboxRouteInfo, TOKEN_ENV_NAME } from "../src/providers/gettransfer/sandbox-client.server";

const from = getLocation("lhr")!;
const to = getLocation("central-london")!;
// 7 days ahead (well beyond the 6-hour minimum), rounded to the hour.
const instant = new Date(Date.now() + 7 * 24 * 3600_000);
instant.setUTCMinutes(0, 0, 0);
const dateTo = localDateTimeWithOffset(instant, from.timeZone);

const result = await sandboxRouteInfo(
  { from: from.coords!, to: to.coords!, pax: 2, dateTo, currency: "USD", distanceUnit: "km" },
  { token: process.env[TOKEN_ENV_NAME], timeoutMs: 15_000 },
);

console.log(JSON.stringify({
  sandbox: "gtrbox.org",
  route: `${from.shortName} -> ${to.shortName} (city-centre representative point, not a hotel)`,
  date_to: dateTo,
  pax: 2,
  result,
  note: "Diagnostic only. Prices are not entered into the public comparison.",
}, null, 2));
process.exit(result.status === "ok" ? 0 : 1);
